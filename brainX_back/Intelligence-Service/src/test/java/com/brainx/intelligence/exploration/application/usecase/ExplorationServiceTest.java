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
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.exploration.domain.SummarySource;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

class ExplorationServiceTest {

    private final FakePorts ports = new FakePorts();
    private final ExplorationService service = new ExplorationService(ports, ports, ports, ports, ports, ports);

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
    void semanticSearchDelegatesQueryTextToSearchIndexAndRecordsUsageAndEvent() {
        ports.searchResults = List.of(new SemanticSearchResult(
            "note-1",
            "RAG note",
            "search context",
            0.91d,
            SearchMatchType.HYBRID
        ));

        var result = service.semanticSearch(new SemanticSearchCommand(
            "user-1",
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
        assertThat(ports.lastSearchQuery.queryText()).isEqualTo("rag search");
        assertThat(ports.lastSearchQuery.limit()).isEqualTo(5);
        assertThat(ports.lastSearchQuery.hybridWithClientKeywordIds()).containsExactly("keyword-1");
        assertThat(ports.tokenUsageRecords).hasSize(1);
        assertThat(ports.tokenUsageRecords.getFirst().featureId()).isEqualTo("semantic-search");
        assertThat(ports.tokenUsageRecords.getFirst().sourceService()).isEqualTo("AI-Service");
        assertThat(ports.semanticSearchEvents).hasSize(1);
        assertThat(ports.semanticSearchEvents.getFirst().resultCount()).isEqualTo(1);
        assertThat(ports.semanticSearchEvents.getFirst().charged()).isTrue();
    }

    @Test
    void getNoteSummaryReturnsCachedAiSummary() {
        ports.summaries.put("user-1::note-1", NoteSummary.ai("user-1", "note-1", "Cached AI summary"));

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
        NoteSummaryPort, ExplorationEventPort {

        private boolean allowed = true;
        private int searchRequests;
        private int workspaceSnapshotRequests;
        private NoteSearchQuery lastSearchQuery;
        private List<SemanticSearchResult> searchResults = List.of();
        private WorkspaceNotePort.NoteSnapshot workspaceSnapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "",
            "",
            Instant.parse("2026-06-19T00:00:00Z")
        );
        private final List<TokenUsageRecord> tokenUsageRecords = new ArrayList<>();
        private final List<SemanticSearchPerformedEvent> semanticSearchEvents = new ArrayList<>();
        private final Map<String, NoteSummary> summaries = new LinkedHashMap<>();

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
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public void replaceNoteChunks(String userId, String noteId, List<NoteSearchDocument> chunks) {
        }

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

        @Override
        public void semanticSearchPerformed(SemanticSearchPerformedEvent event) {
            semanticSearchEvents.add(event);
        }
    }
}
