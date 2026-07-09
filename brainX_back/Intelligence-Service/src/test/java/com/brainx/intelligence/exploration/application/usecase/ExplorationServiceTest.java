package com.brainx.intelligence.exploration.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GetNoteSummaryQuery;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GenerateNoteSummaryCommand;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SearchResultView;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.ExplorationInsufficientContentException;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchMode;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.exploration.domain.SummarySource;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

class ExplorationServiceTest {

    private final FakePorts ports = new FakePorts();
    private final FakeSummaryPort summaryPort = new FakeSummaryPort();
    private final AiChatPort aiChatPort = mock(AiChatPort.class);
    private final AiUsageRecorder aiUsageRecorder = mock(AiUsageRecorder.class);
    private final AiRunRecorder aiRunRecorder = mock(AiRunRecorder.class);
    private final PromptRegistryService promptRegistryService = mock(PromptRegistryService.class);
    private final NoteSummaryProperties noteSummaryProperties = new NoteSummaryProperties();
    private final ExplorationService service = new ExplorationService(
        ports,
        ports,
        ports,
        ports,
        ports,
        summaryPort,
        ports,
        aiChatPort,
        aiUsageRecorder,
        aiRunRecorder,
        promptRegistryService,
        noteSummaryProperties
    );

    @Test
    void semanticSearchStopsBeforeVectorSearchWhenEntitlementDenied() {
        ports.allowed = false;

        assertThatThrownBy(() -> service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            "group-1",
            "rag search",
            Map.of(),
            5,
            List.of()
        )))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(ports.searchRequests).isZero();
        assertThat(ports.tokenUsageRecords).isEmpty();
        assertThat(ports.semanticSearchEvents).isEmpty();
    }

    @Test
    void semanticSearchDelegatesQueryTextToSearchIndexAndRecordsEvent() {
        ports.searchResults = List.of(new SemanticSearchResult(
            "note-1",
            "RAG note",
            "search context",
            0.91d,
            SearchMatchType.HYBRID
        ));

        var result = service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            "group-1",
            "rag search",
            Map.of(),
            5,
            List.of("keyword-1")
        ));

        assertThat(result.results()).hasSize(1);
        assertThat(result.results().getFirst().noteId()).isEqualTo("note-1");
        assertThat(result.results().getFirst().matchedType()).isEqualTo(SearchMatchType.HYBRID);
        assertThat(result.charged()).isTrue();
        assertThat(result.tokenEstimate()).isPositive();
        assertThat(ports.searchRequests).isEqualTo(1);
        assertThat(ports.lastSearchQuery.scope()).isEqualTo(SearchScope.DOCUMENT_GROUP);
        assertThat(ports.lastSearchQuery.documentGroupId()).isEqualTo("group-1");
        assertThat(ports.lastSearchQuery.queryText()).isEqualTo("rag search");
        assertThat(ports.lastSearchQuery.limit()).isEqualTo(5);
        assertThat(ports.lastSearchQuery.hybridWithClientKeywordIds()).containsExactly("keyword-1");
        assertThat(ports.tokenUsageRecords).isEmpty();
        assertThat(ports.semanticSearchEvents).hasSize(1);
        assertThat(ports.semanticSearchEvents.getFirst().scope()).isEqualTo(SearchScope.DOCUMENT_GROUP);
        assertThat(ports.semanticSearchEvents.getFirst().documentGroupId()).isEqualTo("group-1");
        assertThat(ports.semanticSearchEvents.getFirst().resultCount()).isEqualTo(1);
        assertThat(ports.semanticSearchEvents.getFirst().charged()).isTrue();
    }

    @Test
    void semanticSearchRequiresDocumentGroupForDocumentScope() {
        assertThatThrownBy(() -> service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            "rag search",
            Map.of(),
            null,
            List.of()
        )))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("documentGroupId");

        assertThat(ports.searchRequests).isZero();
        assertThat(ports.semanticSearchEvents).isEmpty();
    }

    @Test
    void semanticSearchUserScopeSearchesWithoutDocumentGroup() {
        service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            SearchScope.USER,
            null,
            "rag search",
            Map.of(),
            5,
            List.of()
        ));

        assertThat(ports.lastSearchQuery.scope()).isEqualTo(SearchScope.USER);
        assertThat(ports.lastSearchQuery.documentGroupId()).isNull();
        assertThat(ports.semanticSearchEvents.getFirst().scope()).isEqualTo(SearchScope.USER);
        assertThat(ports.semanticSearchEvents.getFirst().documentGroupId()).isNull();
    }

    @Test
    void semanticSearchUserScopeRejectsDocumentGroupId() {
        assertThatThrownBy(() -> service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            SearchScope.USER,
            "group-1",
            "rag search",
            Map.of(),
            5,
            List.of()
        )))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("documentGroupId");
    }

    @Test
    void keywordSearchBypassesEntitlementAndVectorSearch() {
        ports.allowed = false;
        ports.keywordResults = List.of(new SemanticSearchResult(
            "note-keyword",
            "Keyword note",
            "matched keyword",
            0.8d,
            SearchMatchType.KEYWORD
        ));

        var result = service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            SearchScope.USER,
            null,
            "keyword",
            Map.of(),
            5,
            List.of(),
            SearchMode.KEYWORD
        ));

        assertThat(result.results()).extracting(SearchResultView::noteId).containsExactly("note-keyword");
        assertThat(result.tokenEstimate()).isZero();
        assertThat(result.charged()).isFalse();
        assertThat(ports.searchRequests).isZero();
        assertThat(ports.keywordRequests).isEqualTo(1);
        assertThat(ports.lastKeywordQuery.scope()).isEqualTo(SearchScope.USER);
        assertThat(ports.semanticSearchEvents.getFirst().charged()).isFalse();
    }

    @Test
    void hybridSearchMergesSemanticAndKeywordMatches() {
        ports.searchResults = List.of(new SemanticSearchResult(
            "note-1",
            "Semantic",
            "semantic excerpt",
            0.70d,
            SearchMatchType.SEMANTIC
        ));
        ports.keywordResults = List.of(
            new SemanticSearchResult("note-1", "Semantic", "keyword excerpt", 0.80d, SearchMatchType.KEYWORD),
            new SemanticSearchResult("note-2", "Keyword", "keyword only", 0.60d, SearchMatchType.KEYWORD)
        );

        var result = service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            SearchScope.USER,
            null,
            "hybrid query",
            Map.of(),
            5,
            List.of(),
            SearchMode.HYBRID
        ));

        assertThat(result.results()).extracting(SearchResultView::noteId).containsExactly("note-1", "note-2");
        assertThat(result.results().getFirst().matchedType()).isEqualTo(SearchMatchType.HYBRID);
        assertThat(result.results().getFirst().excerpt()).isEqualTo("keyword excerpt");
        assertThat(result.charged()).isTrue();
        assertThat(ports.searchRequests).isEqualTo(1);
        assertThat(ports.keywordRequests).isEqualTo(1);
    }

    @Test
    void getNoteSummaryReturnsCachedAiSummary() {
        summaryPort.summaries.put("user-1::note-1", NoteSummary.ai("user-1", "note-1", "Cached AI summary"));

        var result = service.getNoteSummary(new GetNoteSummaryQuery("user-1", "note-1"));

        assertThat(result.noteId()).isEqualTo("note-1");
        assertThat(result.summary()).isEqualTo("Cached AI summary");
        assertThat(result.source()).isEqualTo(SummarySource.AI);
        assertThat(ports.workspaceSnapshotRequests).isZero();
    }

    @Test
    void getNoteSummaryFallsBackToWorkspaceExcerptWhenCacheMisses() {
        ports.workspaceSnapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Title",
            "# Workspace markdown summary source",
            Instant.parse("2026-06-19T00:00:00Z")
        );

        var result = service.getNoteSummary(new GetNoteSummaryQuery("user-1", "note-1"));

        assertThat(result.noteId()).isEqualTo("note-1");
        assertThat(result.summary()).contains("Workspace markdown summary source");
        assertThat(result.source()).isEqualTo(SummarySource.EXCERPT);
        assertThat(ports.workspaceSnapshotRequests).isEqualTo(1);
    }

    @Test
    void generateNoteSummaryUsesNanoModelAndPersistsHashScopedSummary() {
        ports.indexStatuses = List.of(new NoteIndexStatusPort.NoteIndexStatusProjection(
            "note-1",
            "INDEXED",
            true,
            Instant.parse("2026-07-09T00:00:00Z")
        ));
        ports.workspaceSnapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "group-1",
            "회의록",
            "이번 회의에서는 그래프 마인드맵 hover 요약과 노트 컨텍스트 패널 갱신 버튼을 논의했다. 저장 시점 선생성과 hover lazy 생성을 함께 사용하기로 했다.",
            List.of(),
            null,
            3,
            Instant.parse("2026-07-09T01:00:00Z")
        );
        when(promptRegistryService.resolve(any(), any()))
            .thenReturn(new PromptRegistryService.PromptResolution("note-summary", "code", "system"));
        when(aiRunRecorder.recordChatGenerateWithRun(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new AiRunRecorder.RecordedChatResponse(
                "run-1",
                new AiChatResponse(
                    "그래프 hover 요약을 제공한다\n저장과 hover에서 생성한다\n컨텍스트 버튼으로 갱신한다",
                    new AiTokenUsage(20, 10, 30)
                )
            ));

        var result = service.generateNoteSummary(new GenerateNoteSummaryCommand(
            "user-1",
            "note-1",
            "group-1",
            false
        ));

        assertThat(result.source()).isEqualTo(SummarySource.AI);
        assertThat(result.documentGroupId()).isEqualTo("group-1");
        assertThat(result.markdownHash()).hasSize(64);
        assertThat(result.modelId()).isEqualTo("gpt-5.4-nano");
        assertThat(summaryPort.summaries.values()).singleElement()
            .satisfies(summary -> {
                assertThat(summary.documentGroupId()).isEqualTo("group-1");
                assertThat(summary.modelId()).isEqualTo("gpt-5.4-nano");
            });
        verify(aiUsageRecorder).recordChatUsage(any(), any(), any(), any(), any());
    }

    @Test
    void generateNoteSummaryRejectsShortContentBeforeModelCall() {
        ports.indexStatuses = List.of(new NoteIndexStatusPort.NoteIndexStatusProjection(
            "note-1",
            "INDEXED",
            true,
            Instant.parse("2026-07-09T00:00:00Z")
        ));
        ports.workspaceSnapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "group-1",
            "짧음",
            "짧은 본문",
            List.of(),
            null,
            1,
            Instant.parse("2026-07-09T01:00:00Z")
        );

        assertThatThrownBy(() -> service.generateNoteSummary(new GenerateNoteSummaryCommand(
            "user-1",
            "note-1",
            "group-1",
            false
        )))
            .isInstanceOf(ExplorationInsufficientContentException.class)
            .hasMessageContaining("요약할 텍스트가 부족");
    }

    private static final class FakePorts
        implements EntitlementPort, TokenUsagePort, WorkspaceNotePort, NoteSearchIndexPort, NoteIndexStatusPort,
        NoteKeywordSearchPort, ExplorationEventPort {

        private boolean allowed = true;
        private int searchRequests;
        private int keywordRequests;
        private int workspaceSnapshotRequests;
        private NoteSearchQuery lastSearchQuery;
        private KeywordSearchQuery lastKeywordQuery;
        private List<SemanticSearchResult> searchResults = List.of();
        private List<SemanticSearchResult> keywordResults = List.of();
        private List<NoteIndexStatusProjection> indexStatuses = List.of();
        private WorkspaceNotePort.NoteSnapshot workspaceSnapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "",
            "",
            Instant.parse("2026-06-19T00:00:00Z")
        );
        private final List<TokenUsageRecord> tokenUsageRecords = new ArrayList<>();
        private final List<SemanticSearchPerformedEvent> semanticSearchEvents = new ArrayList<>();

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            return new EntitlementDecision(allowed, allowed ? null : "QUOTA_EXHAUSTED", allowed ? 100 : 0);
        }

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            tokenUsageRecords.add(record);
        }

        @Override
        public WorkspaceNotePort.NoteSnapshot getNoteSnapshot(String noteId) {
            workspaceSnapshotRequests++;
            return workspaceSnapshot;
        }

        @Override
        public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        }

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            searchRequests++;
            lastSearchQuery = query;
            return searchResults;
        }

        @Override
        public List<SemanticSearchResult> searchKeyword(KeywordSearchQuery query) {
            keywordRequests++;
            lastKeywordQuery = query;
            return keywordResults;
        }

        @Override
        public List<NoteIndexStatusProjection> findNoteIndexStatuses(String userId, String documentGroupId, List<String> noteIds) {
            return indexStatuses;
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public boolean replaceNoteChunks(
            String userId,
            String documentGroupId,
            String noteId,
            List<NoteSearchDocument> chunks
        ) {
            return true;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            return true;
        }

        @Override
        public void semanticSearchPerformed(SemanticSearchPerformedEvent event) {
            semanticSearchEvents.add(event);
        }
    }

    private static final class FakeSummaryPort implements NoteSummaryPort {

        private final Map<String, NoteSummary> summaries = new LinkedHashMap<>();

        @Override
        public Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId) {
            return Optional.ofNullable(summaries.get(userId + "::" + noteId));
        }

        @Override
        public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            return summaries.values().stream()
                .filter(summary -> summary.userId().equals(userId)
                    && summary.documentGroupId().equals(documentGroupId)
                    && summary.noteId().equals(noteId))
                .findFirst();
        }

        @Override
        public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHash(
            String userId,
            String documentGroupId,
            String noteId,
            String markdownHash
        ) {
            return summaries.values().stream()
                .filter(summary -> summary.userId().equals(userId)
                    && summary.documentGroupId().equals(documentGroupId)
                    && summary.noteId().equals(noteId)
                    && summary.markdownHash().equals(markdownHash))
                .findFirst();
        }

        @Override
        public NoteSummary save(NoteSummary summary) {
            summaries.put(summary.userId() + "::" + summary.noteId(), summary);
            return summary;
        }

        @Override
        public void deleteByUserIdAndNoteId(String userId, String noteId) {
            summaries.remove(userId + "::" + noteId);
        }
    }
}
