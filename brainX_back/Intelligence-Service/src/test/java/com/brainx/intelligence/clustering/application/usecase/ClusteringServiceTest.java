package com.brainx.intelligence.clustering.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.GetLatestClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase.ClusterJobCommand;
import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobCompletedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobRequestedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringNoteSourcePort;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobLatestState;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.clustering.domain.ClusteringForbiddenException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.llmops.LlmOpsTestSupport;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementDecision;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class ClusteringServiceTest {

    private final FakeClusterJobStore store = new FakeClusterJobStore();
    private final FakeNoteSource noteSource = new FakeNoteSource();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiModelSettingsPort settingsPort = new FakeAiModelSettingsPort();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeClusteringEventPort eventPort = new FakeClusteringEventPort();
    private final ClusteringProperties properties = new ClusteringProperties();
    private final LlmOpsStore llmOpsStore = LlmOpsTestSupport.store();
    private final ClusteringService service = new ClusteringService(
        store,
        noteSource,
        entitlementPort,
        settingsPort,
        chatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new EmptyAiModelCatalogPort())),
        LlmOpsTestSupport.runRecorder(llmOpsStore),
        LlmOpsTestSupport.promptRegistry(llmOpsStore),
        eventPort,
        properties,
        new ObjectMapper(),
        Clock.fixed(Instant.parse("2026-06-26T00:00:00Z"), ZoneOffset.UTC)
    );

    @Test
    void requestClusterJobDefaultsDocumentGroupAndStoresCompletedJob() {
        settingsPort.settings = Optional.of(new AiModelSettings("user-1", "gpt-user", Map.of()));
        noteSource.notes = List.of(
            note("note-1", "Java", List.of("backend"), List.of("Spring"), "Spring Boot service"),
            note("note-2", "Database", List.of("sql"), List.of("Transaction"), "PostgreSQL transaction")
        );
        chatPort.response = new AiChatResponse(
            """
                [
                  {"title":"백엔드 구조","summary":"Java와 DB 구조를 묶는다.","noteIds":["note-1","note-2"],"keywords":["Spring","PostgreSQL"],"confidence":0.88}
                ]
                """,
            new AiTokenUsage(80, 20, 100, 10, 3)
        );

        ClusterJob job = service.requestClusterJob(new ClusterJobCommand(
            "user-1",
            Map.of("maxNotes", 10),
            Map.of("maxClusters", 3),
            "idem-1"
        ));

        assertThat(job.status()).isEqualTo(ClusterJobStatus.COMPLETED);
        assertThat(job.documentGroupId()).isEqualTo("default");
        assertThat(job.scope()).containsEntry("documentGroupId", "default").containsEntry("maxNotes", 10);
        assertThat(job.algorithmOptions()).containsEntry("maxClusters", 3);
        assertThat(job.clusters()).hasSize(1);
        assertThat(job.clusters().getFirst().noteIds()).containsExactly("note-1", "note-2");
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("gpt-user");
        assertThat(chatPort.lastRequest.messages().getFirst().content())
            .contains("Every input note ID must appear exactly once")
            .contains("Do not duplicate note IDs")
            .doesNotContain("Mandatory user style instructions")
            .doesNotContain("Use this formality/tone: business");
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Spring Boot service")
            .contains("All input note IDs")
            .contains("[\"note-1\",\"note-2\"]");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("AI_CLUSTERING");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("ai-clustering-chat");
        assertThat(tokenUsagePort.records.getFirst().inputTokens()).isEqualTo(80);
        assertThat(tokenUsagePort.records.getFirst().cachedInputTokens()).isEqualTo(10);
        assertThat(eventPort.requestedEvents).hasSize(1);
        assertThat(eventPort.requestedEvents.getFirst().scope()).doesNotContainKey(ClusteringService.SOURCE_SNAPSHOT_SCOPE_KEY);
        assertThat(eventPort.completedEvents).hasSize(1);
        assertThat(job.scope()).containsKey(ClusteringService.SOURCE_SNAPSHOT_SCOPE_KEY);
    }

    @Test
    void idempotencyKeyReturnsExistingJobWithoutSecondModelCall() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse(
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1"],"keywords":["Spring"],"confidence":0.9}]
                """,
            null
        );

        ClusterJob first = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), "same-key"));
        ClusterJob second = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), "same-key"));

        assertThat(second.clusterJobId()).isEqualTo(first.clusterJobId());
        assertThat(chatPort.generateCalls).isEqualTo(1);
        assertThat(eventPort.requestedEvents).hasSize(1);
    }

    @Test
    void entitlementDeniedStopsBeforeJobAndAiCall() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null)))
            .isInstanceOf(ClusteringForbiddenException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(store.jobsById).isEmpty();
        assertThat(chatPort.generateCalls).isZero();
        assertThat(eventPort.requestedEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void noteIdsScopeRequiresAllRequestedNotesToBeSearchable() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));

        assertThatThrownBy(() -> service.requestClusterJob(new ClusterJobCommand(
            "user-1",
            Map.of("noteIds", List.of("note-1", "missing")),
            Map.of(),
            null
        )))
            .isInstanceOf(ClusteringNotFoundException.class)
            .hasMessageContaining("missing");

        assertThat(chatPort.generateCalls).isZero();
    }

    @Test
    void validationFailureRunsOneRepairPassAndStoresRepairedClusters() {
        noteSource.notes = List.of(
            note("note-1", "Java", List.of(), List.of(), "Spring"),
            note("note-2", "Database", List.of(), List.of(), "PostgreSQL")
        );
        chatPort.responses.add(new AiChatResponse(
            """
                [
                  {"title":"Broken A","summary":"summary","noteIds":["note-1","note-1","ghost"],"keywords":["bad"],"confidence":0.4},
                  {"title":"Broken B","summary":"summary","noteIds":[],"keywords":["empty"],"confidence":0.2}
                ]
                """,
            new AiTokenUsage(40, 10, 50)
        ));
        chatPort.responses.add(new AiChatResponse(
            """
                [
                  {"title":"Backend Data","summary":"summary","noteIds":["note-1","note-2"],"keywords":["Spring","PostgreSQL"],"confidence":0.91}
                ]
                """,
            new AiTokenUsage(30, 8, 38)
        ));

        ClusterJob job = service.requestClusterJob(new ClusterJobCommand(
            "user-1",
            Map.of(),
            Map.of("maxClusters", 1),
            null
        ));

        assertThat(job.status()).isEqualTo(ClusterJobStatus.COMPLETED);
        assertThat(job.clusters()).hasSize(1);
        assertThat(job.clusters().getFirst().noteIds()).containsExactly("note-1", "note-2");
        assertThat(chatPort.generateCalls).isEqualTo(2);
        assertThat(chatPort.requests.get(1).messages().get(1).content())
            .contains("Your previous clustering failed validation")
            .contains("missing note IDs")
            .contains("unknown note IDs")
            .contains("duplicate note IDs")
            .contains("clusterCount exceeds maxClusters")
            .contains("cluster[2] noteIds is empty");
        assertThat(entitlementPort.requests).hasSize(2);
        assertThat(tokenUsagePort.records).hasSize(2);
        assertThat(eventPort.completedEvents).hasSize(1);
        assertThat(job.llmRunId()).isNotBlank();
    }

    @Test
    void repairFailureStoresFailedJobWithoutCompletedEvent() {
        noteSource.notes = List.of(
            note("note-1", "Java", List.of(), List.of(), "Spring"),
            note("note-2", "Database", List.of(), List.of(), "PostgreSQL")
        );
        chatPort.responses.add(new AiChatResponse(
            """
                [{"title":"Broken","summary":"summary","noteIds":["note-1"],"keywords":["bad"],"confidence":0.4}]
                """,
            new AiTokenUsage(40, 10, 50)
        ));
        chatPort.responses.add(new AiChatResponse(
            """
                [{"title":"Still Broken","summary":"summary","noteIds":["note-1","ghost"],"keywords":["bad"],"confidence":0.4}]
                """,
            new AiTokenUsage(30, 8, 38)
        ));

        ClusterJob job = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null));

        assertThat(job.status()).isEqualTo(ClusterJobStatus.FAILED);
        assertThat(job.failureMessage()).contains("Cluster response failed validation");
        assertThat(chatPort.generateCalls).isEqualTo(2);
        assertThat(tokenUsagePort.records).hasSize(2);
        assertThat(eventPort.completedEvents).isEmpty();
        assertThat(job.llmRunId()).isNotBlank();
    }

    @Test
    void invalidProviderJsonIsStoredAsFailedJob() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse("not json", null);

        ClusterJob job = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null));

        assertThat(job.status()).isEqualTo(ClusterJobStatus.FAILED);
        assertThat(job.failureMessage()).contains("not valid JSON");
        assertThat(store.jobsById.get(job.clusterJobId()).status()).isEqualTo(ClusterJobStatus.FAILED);
        assertThat(chatPort.generateCalls).isEqualTo(2);
        assertThat(eventPort.requestedEvents).hasSize(1);
        assertThat(eventPort.completedEvents).isEmpty();
    }

    @Test
    void latestReturnsNotAnalyzedWhenNoWorkspaceJobExists() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));

        var latest = service.getLatestClusterJob(new GetLatestClusterJobQuery("user-1", "default"));

        assertThat(latest.state()).isEqualTo(ClusterJobLatestState.NOT_ANALYZED);
        assertThat(latest.searchableNoteCount()).isEqualTo(1);
        assertThat(latest.latestNoteUpdatedAt()).isEqualTo(Instant.parse("2026-06-26T00:00:00Z"));
        assertThat(latest.job()).isNull();
    }

    @Test
    void latestReturnsFreshWhenSourceSnapshotMatches() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse(
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1"],"keywords":["Spring"],"confidence":0.9}]
                """,
            null
        );
        ClusterJob job = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null));

        var latest = service.getLatestClusterJob(new GetLatestClusterJobQuery("user-1", "default"));

        assertThat(latest.state()).isEqualTo(ClusterJobLatestState.FRESH);
        assertThat(latest.job().clusterJobId()).isEqualTo(job.clusterJobId());
    }

    @Test
    void latestReturnsStaleWhenSourceSnapshotDiffers() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse(
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1"],"keywords":["Spring"],"confidence":0.9}]
                """,
            null
        );
        service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null));
        noteSource.notes = List.of(note(
            "note-1",
            "Java",
            List.of(),
            List.of(),
            "Spring changed",
            Instant.parse("2026-06-27T00:00:00Z")
        ));

        var latest = service.getLatestClusterJob(new GetLatestClusterJobQuery("user-1", "default"));

        assertThat(latest.state()).isEqualTo(ClusterJobLatestState.STALE);
        assertThat(latest.latestNoteUpdatedAt()).isEqualTo(Instant.parse("2026-06-27T00:00:00Z"));
    }

    @Test
    void latestIgnoresNoteIdsScopedJobs() {
        noteSource.notes = List.of(
            note("note-1", "Java", List.of(), List.of(), "Spring"),
            note("note-2", "Database", List.of(), List.of(), "PostgreSQL")
        );
        chatPort.response = new AiChatResponse(
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1"],"keywords":["Spring"],"confidence":0.9}]
                """,
            null
        );
        service.requestClusterJob(new ClusterJobCommand(
            "user-1",
            Map.of("noteIds", List.of("note-1")),
            Map.of(),
            null
        ));

        var latest = service.getLatestClusterJob(new GetLatestClusterJobQuery("user-1", "default"));

        assertThat(latest.state()).isEqualTo(ClusterJobLatestState.NOT_ANALYZED);
        assertThat(latest.job()).isNull();
    }

    @Test
    void latestReturnsFailedForLatestWorkspaceJobFailure() {
        noteSource.notes = List.of(note("note-1", "Java", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse("not json", null);
        ClusterJob failed = service.requestClusterJob(new ClusterJobCommand("user-1", Map.of(), Map.of(), null));

        var latest = service.getLatestClusterJob(new GetLatestClusterJobQuery("user-1", "default"));

        assertThat(failed.status()).isEqualTo(ClusterJobStatus.FAILED);
        assertThat(latest.state()).isEqualTo(ClusterJobLatestState.FAILED);
        assertThat(latest.job().clusterJobId()).isEqualTo(failed.clusterJobId());
    }

    private static KnowledgeAnalysisNote note(
        String noteId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt
    ) {
        return note(noteId, title, tags, headings, excerpt, Instant.parse("2026-06-26T00:00:00Z"));
    }

    private static KnowledgeAnalysisNote note(
        String noteId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt,
        Instant updatedAt
    ) {
        return new KnowledgeAnalysisNote(
            "user-1",
            "default",
            noteId,
            title,
            tags,
            headings,
            excerpt,
            updatedAt
        );
    }

    private static class FakeClusterJobStore implements ClusterJobStore {
        private final Map<String, ClusterJob> jobsById = new LinkedHashMap<>();
        private final Map<String, ClusterJob> jobsByIdempotency = new LinkedHashMap<>();

        @Override
        public ClusterJob save(ClusterJob job) {
            jobsById.put(job.clusterJobId(), job);
            if (job.idempotencyKey() != null) {
                jobsByIdempotency.put(job.userId() + "::" + job.idempotencyKey(), job);
            }
            return job;
        }

        @Override
        public Optional<ClusterJob> findByUserIdAndClusterJobId(String userId, String clusterJobId) {
            return Optional.ofNullable(jobsById.get(clusterJobId))
                .filter(job -> job.userId().equals(userId));
        }

        @Override
        public Optional<ClusterJob> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey) {
            return Optional.ofNullable(jobsByIdempotency.get(userId + "::" + idempotencyKey));
        }

        @Override
        public List<ClusterJob> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit) {
            return jobsById.values().stream()
                .filter(job -> job.userId().equals(userId) && job.documentGroupId().equals(documentGroupId))
                .sorted((left, right) -> {
                    int byCreatedAt = right.createdAt().compareTo(left.createdAt());
                    return byCreatedAt != 0 ? byCreatedAt : right.clusterJobId().compareTo(left.clusterJobId());
                })
                .limit(limit)
                .toList();
        }
    }

    private static class FakeNoteSource implements ClusteringNoteSourcePort {
        private List<KnowledgeAnalysisNote> notes = List.of();

        @Override
        public List<KnowledgeAnalysisNote> findClusteringSourceNotes(String userId, String documentGroupId, int limit) {
            return notes.stream().limit(limit).toList();
        }

        @Override
        public List<KnowledgeAnalysisNote> findClusteringSourceNotesByIds(String userId, String documentGroupId, List<String> noteIds) {
            return noteIds.stream()
                .flatMap(noteId -> notes.stream().filter(note -> note.noteId().equals(noteId)))
                .toList();
        }
    }

    private static class FakeEntitlementPort implements EntitlementPort {
        private boolean allowed = true;
        private String reasonCode = "OK";
        private final List<EntitlementRequest> requests = new ArrayList<>();
        private EntitlementRequest lastRequest;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            lastRequest = request;
            requests.add(request);
            return new EntitlementDecision(allowed, reasonCode, 1000);
        }
    }

    private static class FakeAiModelSettingsPort implements AiModelSettingsPort {
        private Optional<AiModelSettings> settings = Optional.empty();

        @Override
        public AiModelSettings save(AiModelSettings settings) {
            this.settings = Optional.of(settings);
            return settings;
        }

        @Override
        public Optional<AiModelSettings> findSettingsByUserId(String userId) {
            return settings;
        }
    }

    private static class FakeAiChatPort implements AiChatPort {
        private AiChatResponse response = new AiChatResponse("[]", null);
        private final List<AiChatResponse> responses = new ArrayList<>();
        private final List<AiChatRequest> requests = new ArrayList<>();
        private AiChatRequest lastRequest;
        private int generateCalls;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            lastRequest = request;
            requests.add(request);
            generateCalls++;
            if (!responses.isEmpty()) {
                return responses.remove(0);
            }
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static class FakeTokenUsagePort implements TokenUsagePort {
        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static class FakeClusteringEventPort implements ClusteringEventPort {
        private final List<ClusterJobRequestedEvent> requestedEvents = new ArrayList<>();
        private final List<ClusterJobCompletedEvent> completedEvents = new ArrayList<>();

        @Override
        public void clusterJobRequested(ClusterJobRequestedEvent event) {
            requestedEvents.add(event);
        }

        @Override
        public void clusterJobCompleted(ClusterJobCompletedEvent event) {
            completedEvents.add(event);
        }
    }

    private static class EmptyAiModelCatalogPort implements AiModelCatalogPort {
        @Override
        public List<AiModel> findAll() {
            return List.of();
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return false;
        }
    }
}
