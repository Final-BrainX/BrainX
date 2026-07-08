package com.brainx.intelligence.exploration.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GetNoteSummaryQuery;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SearchResultView;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchMode;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.exploration.domain.SummarySource;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

class ExplorationServiceTest {

    private final FakePorts ports = new FakePorts();
    private final FakeSummaryPort summaryPort = new FakeSummaryPort();
    private final ExplorationService service = new ExplorationService(ports, ports, ports, ports, summaryPort, ports);

    @Test
    void semanticSearchStopsBeforeVectorSearchWhenEntitlementDenied() {
        ports.allowed = false;

        assertThatThrownBy(() -> service.semanticSearch(new SemanticSearchCommand(
            "user-1",
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
    void semanticSearchDefaultsToDocumentGroupDefaultScope() {
        service.semanticSearch(new SemanticSearchCommand(
            "user-1",
            "rag search",
            Map.of(),
            null,
            List.of()
        ));

        assertThat(ports.lastSearchQuery.scope()).isEqualTo(SearchScope.DOCUMENT_GROUP);
        assertThat(ports.lastSearchQuery.documentGroupId()).isEqualTo("default");
        assertThat(ports.semanticSearchEvents.getFirst().scope()).isEqualTo(SearchScope.DOCUMENT_GROUP);
        assertThat(ports.semanticSearchEvents.getFirst().documentGroupId()).isEqualTo("default");
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

    private static final class FakePorts
        implements EntitlementPort, TokenUsagePort, WorkspaceNotePort, NoteSearchIndexPort,
        NoteKeywordSearchPort, ExplorationEventPort {

        private boolean allowed = true;
        private int searchRequests;
        private int keywordRequests;
        private int workspaceSnapshotRequests;
        private NoteSearchQuery lastSearchQuery;
        private KeywordSearchQuery lastKeywordQuery;
        private List<SemanticSearchResult> searchResults = List.of();
        private List<SemanticSearchResult> keywordResults = List.of();
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
