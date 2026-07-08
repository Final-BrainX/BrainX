package com.brainx.intelligence.clustering.application.usecase;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.clustering.application.port.inbound.GetClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.GetLatestClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.LatestClusterJob;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringNoteSourcePort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobCompletedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobRequestedEvent;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobLatestState;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.brainx.intelligence.clustering.domain.ClusteringForbiddenException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ClusteringService implements RequestClusterJobUseCase, GetClusterJobUseCase, GetLatestClusterJobUseCase {

    static final String AI_CLUSTERING_CAPABILITY = "AI_CLUSTERING";
    static final String AI_CLUSTERING_FEATURE_ID = "ai-clustering-chat";
    static final String SOURCE_SNAPSHOT_SCOPE_KEY = "_sourceSnapshot";
    private static final int HARD_MAX_NOTES = 50;
    private static final int HARD_MAX_CLUSTERS = 12;
    private static final int LATEST_JOB_LOOKBACK = 20;

    private final ClusterJobStore clusterJobStore;
    private final ClusteringNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final ClusteringEventPort clusteringEventPort;
    private final ClusteringProperties properties;
    private final ObjectMapper objectMapper;
    private final ClusterResponseParser clusterResponseParser;
    private final Clock clock;

    @Autowired
    public ClusteringService(
        ClusterJobStore clusterJobStore,
        ClusteringNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        ClusteringEventPort clusteringEventPort,
        ClusteringProperties properties,
        ObjectMapper objectMapper
    ) {
        this(
            clusterJobStore,
            noteSourcePort,
            entitlementPort,
            aiModelSettingsPort,
            aiChatPort,
            aiUsageRecorder,
            aiRunRecorder,
            promptRegistryService,
            clusteringEventPort,
            properties,
            objectMapper,
            Clock.systemUTC()
        );
    }

    ClusteringService(
        ClusterJobStore clusterJobStore,
        ClusteringNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        ClusteringEventPort clusteringEventPort,
        ClusteringProperties properties,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.clusterJobStore = clusterJobStore;
        this.noteSourcePort = noteSourcePort;
        this.entitlementPort = entitlementPort;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.clusteringEventPort = clusteringEventPort;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clusterResponseParser = new ClusterResponseParser(objectMapper);
        this.clock = clock;
    }

    @Override
    @Transactional
    public ClusterJob requestClusterJob(ClusterJobCommand command) {
        String userId = requireText(command.userId(), "userId");
        String idempotencyKey = normalizeNullable(command.idempotencyKey());
        if (idempotencyKey != null) {
            var existing = clusterJobStore.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        ScopeSpec scope = ScopeSpec.from(command.scope(), properties.getMaxNotes());
        int maxClusters = maxClusters(command.algorithmOptions());
        Map<String, Object> algorithmOptions = normalizedAlgorithmOptions(command.algorithmOptions(), maxClusters);
        List<KnowledgeAnalysisNote> notes = loadNotes(userId, scope);
        if (notes.isEmpty()) {
            throw new ClusteringConflictException("No searchable notes are available for clustering.");
        }

        String modelId = resolveModelId(userId);
        PromptResolution promptResolution = promptRegistryService.resolve("clustering", systemPrompt());
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                promptResolution.template(),
                clusteringInstructions()
            ),
            runtimeInstructions(maxClusters, notes.size())
        );
        String userPrompt = userPrompt(notes, maxClusters);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            AI_CLUSTERING_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ClusteringForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }

        String clusterJobId = UUID.randomUUID().toString();
        Instant now = Instant.now(clock);
        ClusterJob running = clusterJobStore.save(ClusterJob.running(
            clusterJobId,
            userId,
            scope.documentGroupId(),
            scopeWithSourceSnapshot(scope.normalizedScope(), notes),
            algorithmOptions,
            modelId,
            idempotencyKey,
            now
        ));
        clusteringEventPort.clusterJobRequested(new ClusterJobRequestedEvent(
            userId,
            clusterJobId,
            publicScope(running.scope()),
            running.algorithmOptions()
        ));

        String llmRunId = null;
        try {
            ClusteringAttempt initialAttempt = runClusteringAttempt(
                userId,
                modelId,
                clusterJobId,
                scope.documentGroupId(),
                promptResolution,
                systemPrompt,
                userPrompt,
                "initial"
            );
            llmRunId = initialAttempt.llmRunId();
            List<Cluster> clusters;
            try {
                clusters = clusterResponseParser.parseClusters(clusterJobId, initialAttempt.content(), notes, maxClusters);
            } catch (IllegalArgumentException validationException) {
                String repairPrompt = repairPrompt(notes, maxClusters, initialAttempt.content(), validationException);
                checkRepairEntitlement(userId, systemPrompt, repairPrompt);
                ClusteringAttempt repairAttempt = runClusteringAttempt(
                    userId,
                    modelId,
                    clusterJobId,
                    scope.documentGroupId(),
                    promptResolution,
                    systemPrompt,
                    repairPrompt,
                    "repair"
                );
                llmRunId = repairAttempt.llmRunId();
                clusters = clusterResponseParser.parseClusters(clusterJobId, repairAttempt.content(), notes, maxClusters);
            }
            ClusterJob completed = clusterJobStore.save(running.withLlmRunId(llmRunId).completed(clusters, Instant.now(clock)));
            clusteringEventPort.clusterJobCompleted(new ClusterJobCompletedEvent(
                userId,
                clusterJobId,
                clusters.size()
            ));
            return completed;
        } catch (RuntimeException exception) {
            return clusterJobStore.save(running.withLlmRunId(llmRunId).failed(safeFailureMessage(exception), Instant.now(clock)));
        }
    }

    @Override
    @Transactional(readOnly = true)
    public ClusterJob getClusterJob(GetClusterJobQuery query) {
        return clusterJobStore.findByUserIdAndClusterJobId(
                requireText(query.userId(), "userId"),
                requireText(query.clusterJobId(), "clusterJobId")
            )
            .orElseThrow(() -> new ClusteringNotFoundException("Cluster job was not found."));
    }

    @Override
    @Transactional(readOnly = true)
    public LatestClusterJob getLatestClusterJob(GetLatestClusterJobQuery query) {
        String userId = requireText(query.userId(), "userId");
        String documentGroupId = DocumentGroups.normalize(query.documentGroupId());
        List<KnowledgeAnalysisNote> notes = noteSourcePort.findClusteringSourceNotes(
            userId,
            documentGroupId,
            Math.min(properties.getMaxNotes(), HARD_MAX_NOTES)
        );
        Instant latestNoteUpdatedAt = latestNoteUpdatedAt(notes);
        if (notes.isEmpty()) {
            return new LatestClusterJob(
                documentGroupId,
                0,
                null,
                ClusterJobLatestState.NO_SOURCE_NOTES,
                null
            );
        }

        ClusterJob latestJob = clusterJobStore.findRecentByUserIdAndDocumentGroupId(
                userId,
                documentGroupId,
                LATEST_JOB_LOOKBACK
            ).stream()
            .filter(ClusteringService::isWorkspaceClusterJob)
            .findFirst()
            .orElse(null);
        if (latestJob == null) {
            return new LatestClusterJob(
                documentGroupId,
                notes.size(),
                latestNoteUpdatedAt,
                ClusterJobLatestState.NOT_ANALYZED,
                null
            );
        }

        ClusterJobLatestState state = latestState(latestJob, notes);
        return new LatestClusterJob(
            documentGroupId,
            notes.size(),
            latestNoteUpdatedAt,
            state,
            latestJob
        );
    }

    private List<KnowledgeAnalysisNote> loadNotes(String userId, ScopeSpec scope) {
        if (scope.noteIds().isEmpty()) {
            return noteSourcePort.findClusteringSourceNotes(userId, scope.documentGroupId(), scope.maxNotes());
        }
        List<KnowledgeAnalysisNote> notes = noteSourcePort.findClusteringSourceNotesByIds(
            userId,
            scope.documentGroupId(),
            scope.noteIds()
        );
        LinkedHashSet<String> found = new LinkedHashSet<>();
        notes.forEach(note -> found.add(note.noteId()));
        List<String> missing = scope.noteIds().stream()
            .filter(noteId -> !found.contains(noteId))
            .toList();
        if (!missing.isEmpty()) {
            throw new ClusteringNotFoundException("Cluster source notes are not available: " + String.join(", ", missing));
        }
        return notes;
    }

    private String resolveModelId(String userId) {
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseGet(() -> requireText(properties.getDefaultModel(), "brainx.clustering.default-model"));
    }

    private String userPrompt(List<KnowledgeAnalysisNote> notes, int maxClusters) {
        List<Map<String, Object>> noteCards = noteCards(notes);
        List<String> noteIds = noteIds(notes);
        return """
            Note cards from one document group:
            %s

            All input note IDs:
            %s

            Group these notes into meaningful knowledge clusters.

            Requirements:
            - Use only the note IDs listed in All input note IDs.
            - Every listed note ID must appear exactly once.
            - Do not invent note IDs.
            - Do not omit note IDs.
            - Return at most %d clusters.
            """.formatted(toJson(noteCards), toJson(noteIds), maxClusters);
    }

    private String repairPrompt(
        List<KnowledgeAnalysisNote> notes,
        int maxClusters,
        String previousOutput,
        RuntimeException validationException
    ) {
        return """
            Your previous clustering failed validation.

            Note cards from one document group:
            %s

            All input note IDs:
            %s

            Previous output:
            %s

            Validation errors:
            %s

            Return a corrected JSON array only.
            Every input note ID must appear exactly once.
            Do not invent IDs.
            Do not duplicate IDs.
            Do not exceed %d clusters.
            Do not create empty clusters.
            """.formatted(
                toJson(noteCards(notes)),
                toJson(noteIds(notes)),
                previousOutput == null ? "" : previousOutput,
                validationException.getMessage(),
                maxClusters
            );
    }

    private static List<Map<String, Object>> noteCards(List<KnowledgeAnalysisNote> notes) {
        List<Map<String, Object>> noteCards = notes.stream()
            .map(note -> {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("noteId", note.noteId());
                values.put("title", note.title());
                values.put("tags", note.tags());
                values.put("headings", note.headings());
                values.put("excerpt", note.excerpt());
                return values;
            })
            .toList();
        return noteCards;
    }

    private static List<String> noteIds(List<KnowledgeAnalysisNote> notes) {
        return notes.stream().map(KnowledgeAnalysisNote::noteId).toList();
    }

    private static String systemPrompt() {
        return """
            You are BrainX knowledge structure analyst.

            Return only a strict JSON array of cluster objects.
            Do not return markdown fences, prose, comments, or additional fields.
            """;
    }

    private static String clusteringInstructions() {
        return """
            Your task is to create useful knowledge clusters from the provided note cards.
            A good cluster groups notes that share a meaningful topic, problem, concept, project, method, decision, or workflow stage.

            Hard requirements:
            - Use only note IDs that appear in the input note cards.
            - Every input note ID must appear exactly once across all clusters.
            - Do not omit ambiguous notes. Assign each ambiguous note to the closest reasonable cluster and lower the confidence if needed.
            - Do not duplicate note IDs across clusters.
            - Do not invent note IDs.
            - Do not create a "미분류", "기타", "Other", or "Unclassified" cluster unless the note card is nearly empty, corrupted, or impossible to relate to any other note.
            - If maxClusters is too small, merge the closest themes instead of dropping notes.
            - Prefer meaningful data-driven clusters over predefined categories.
            - Avoid singleton clusters. A cluster with only one note is allowed only when that note has no plausible semantic relation to any other note.
            - If there are enough notes, do not collapse everything into one cluster unless all notes clearly share one central theme.

            Each cluster object must contain exactly:
            - title: concise Korean cluster title, 2 to 10 words
            - summary: one Korean sentence explaining the cluster
            - noteIds: array of source note IDs in this cluster
            - keywords: array of 2 to 6 Korean or technical keywords
            - confidence: number from 0 to 1

            Clustering guidance:
            - Prefer clusters that are internally coherent and clearly separated from other clusters.
            - Prefer broader conceptual groupings over superficial grouping by identical tags.
            - Use title, tags, headings, and excerpt together.
            - When tags conflict with content, prioritize the semantic content of title, headings, and excerpt.
            - Confidence should be high only when the cluster has strong internal coherence and clear separation.
            """;
    }

    private static String runtimeInstructions(int maxClusters, int noteCount) {
        int softTarget = Math.min(maxClusters, Math.max(1, (int) Math.round(Math.sqrt(noteCount))));
        return """
            Runtime constraints:
            - Input note count: %d
            - Return at most %d cluster objects.
            - Suggested cluster count is around %d, but choose fewer or more if the notes clearly require it.
            - If input note count is 5 or more, return at least 2 clusters unless all notes clearly share one central theme.
            - If returning only 1 cluster for 5 or more notes, the cluster must be highly coherent and confidence should reflect that.
            - Prefer clusters with 2 or more notes.
            - Do not leave notes unassigned.
            """.formatted(noteCount, maxClusters, softTarget);
    }

    private ClusteringAttempt runClusteringAttempt(
        String userId,
        String modelId,
        String clusterJobId,
        String documentGroupId,
        PromptResolution promptResolution,
        String systemPrompt,
        String userPrompt,
        String stage
    ) {
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, systemPrompt),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        AiRunRecorder.RecordedChatResponse recorded = aiRunRecorder.recordChatGenerateWithRun(
            userId,
            AI_CLUSTERING_FEATURE_ID,
            promptResolution.promptKey(),
            promptResolution.version(),
            modelId,
            "CLUSTER_JOB",
            clusterJobId,
            messages,
            Map.of("documentGroupId", documentGroupId, "stage", stage),
            () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
        );
        AiChatResponse response = recorded.response();
        recordUsage(userId, modelId, clusterJobId, response == null ? null : response.tokenUsage());
        String content = response == null || response.content() == null ? "" : response.content();
        return new ClusteringAttempt(recorded.llmRunId(), content);
    }

    private void checkRepairEntitlement(String userId, String systemPrompt, String repairPrompt) {
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            AI_CLUSTERING_CAPABILITY,
            estimateTokens(systemPrompt + "\n" + repairPrompt)
        ));
        if (!entitlement.allowed()) {
            throw new ClusteringForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }
    }

    private void recordUsage(
        String userId,
        String modelId,
        String clusterJobId,
        AiTokenUsage tokenUsage
    ) {
        aiUsageRecorder.recordChatUsage(userId, AI_CLUSTERING_FEATURE_ID, modelId, clusterJobId, tokenUsage);
    }

    private Map<String, Object> normalizedAlgorithmOptions(Map<String, Object> input, int maxClusters) {
        Map<String, Object> values = input == null ? new LinkedHashMap<>() : new LinkedHashMap<>(input);
        values.put("maxClusters", maxClusters);
        return values;
    }

    private Map<String, Object> scopeWithSourceSnapshot(
        Map<String, Object> scope,
        List<KnowledgeAnalysisNote> notes
    ) {
        Map<String, Object> values = new LinkedHashMap<>(scope == null ? Map.of() : scope);
        values.put(SOURCE_SNAPSHOT_SCOPE_KEY, sourceSnapshot(notes));
        return values;
    }

    private static Map<String, Object> publicScope(Map<String, Object> scope) {
        Map<String, Object> values = new LinkedHashMap<>(scope == null ? Map.of() : scope);
        values.remove(SOURCE_SNAPSHOT_SCOPE_KEY);
        return values;
    }

    private static Map<String, Object> sourceSnapshot(List<KnowledgeAnalysisNote> notes) {
        List<Map<String, Object>> sourceNotes = notes.stream()
            .sorted(Comparator.comparing(KnowledgeAnalysisNote::noteId))
            .map(note -> {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("noteId", note.noteId());
                values.put("updatedAt", note.updatedAt().toString());
                return values;
            })
            .toList();
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("noteCount", notes.size());
        Instant latestUpdatedAt = latestNoteUpdatedAt(notes);
        snapshot.put("latestNoteUpdatedAt", latestUpdatedAt == null ? null : latestUpdatedAt.toString());
        snapshot.put("notes", sourceNotes);
        return snapshot;
    }

    private static ClusterJobLatestState latestState(ClusterJob job, List<KnowledgeAnalysisNote> notes) {
        if (job.status() == ClusterJobStatus.FAILED) {
            return ClusterJobLatestState.FAILED;
        }
        if (job.status() != ClusterJobStatus.COMPLETED) {
            return ClusterJobLatestState.STALE;
        }
        return sourceSnapshotMatches(job.scope().get(SOURCE_SNAPSHOT_SCOPE_KEY), notes)
            ? ClusterJobLatestState.FRESH
            : ClusterJobLatestState.STALE;
    }

    private static boolean sourceSnapshotMatches(Object snapshot, List<KnowledgeAnalysisNote> notes) {
        return sourceVersionMap(notes).equals(snapshotVersionMap(snapshot));
    }

    private static Map<String, String> sourceVersionMap(List<KnowledgeAnalysisNote> notes) {
        Map<String, String> values = new LinkedHashMap<>();
        notes.stream()
            .sorted(Comparator.comparing(KnowledgeAnalysisNote::noteId))
            .forEach(note -> values.put(note.noteId(), note.updatedAt().toString()));
        return values;
    }

    private static Map<String, String> snapshotVersionMap(Object snapshot) {
        if (!(snapshot instanceof Map<?, ?> values)) {
            return Map.of();
        }
        Object rawNotes = values.get("notes");
        if (!(rawNotes instanceof List<?> notes)) {
            return Map.of();
        }
        Map<String, String> versions = new LinkedHashMap<>();
        for (Object item : notes) {
            if (!(item instanceof Map<?, ?> note)) {
                continue;
            }
            Object noteId = note.get("noteId");
            Object updatedAt = note.get("updatedAt");
            if (noteId != null && updatedAt != null && StringUtils.hasText(noteId.toString())) {
                versions.put(noteId.toString().trim(), updatedAt.toString().trim());
            }
        }
        return versions;
    }

    private static Instant latestNoteUpdatedAt(List<KnowledgeAnalysisNote> notes) {
        return notes.stream()
            .map(KnowledgeAnalysisNote::updatedAt)
            .max(Instant::compareTo)
            .orElse(null);
    }

    private static boolean isWorkspaceClusterJob(ClusterJob job) {
        return !hasScopedNoteIds(publicScope(job.scope()));
    }

    private static boolean hasScopedNoteIds(Map<String, Object> scope) {
        Object value = scope == null ? null : scope.get("noteIds");
        if (!(value instanceof List<?> noteIds)) {
            return false;
        }
        return noteIds.stream().anyMatch(item -> item != null && StringUtils.hasText(item.toString()));
    }

    private int maxClusters(Map<String, Object> algorithmOptions) {
        int configured = Math.min(properties.getMaxClusters(), HARD_MAX_CLUSTERS);
        return boundedInt(value(algorithmOptions, "maxClusters"), configured, 1, HARD_MAX_CLUSTERS);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            return String.valueOf(value);
        }
    }

    private static int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(text.length() / 4.0d));
    }

    private static Object value(Map<String, Object> values, String key) {
        return values == null ? null : values.get(key);
    }

    private static int boundedInt(Object value, int defaultValue, int min, int max) {
        int parsed = intValue(value, defaultValue);
        return Math.max(min, Math.min(max, parsed));
    }

    private static int intValue(Object value, int defaultValue) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private static String safeFailureMessage(RuntimeException exception) {
        String message = exception.getMessage();
        if (!StringUtils.hasText(message)) {
            message = exception.getClass().getSimpleName();
        }
        return message.length() > 300 ? message.substring(0, 300) : message;
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }

    private record ScopeSpec(
        String documentGroupId,
        List<String> noteIds,
        int maxNotes,
        Map<String, Object> normalizedScope
    ) {

        private static ScopeSpec from(Map<String, Object> scope, int configuredMaxNotes) {
            Map<String, Object> values = scope == null ? new LinkedHashMap<>() : new LinkedHashMap<>(scope);
            String documentGroupId = DocumentGroups.normalize(stringValue(values.get("documentGroupId")));
            int maxNotes = boundedInt(values.get("maxNotes"), Math.min(configuredMaxNotes, HARD_MAX_NOTES), 1, HARD_MAX_NOTES);
            List<String> noteIds = stringValues(values.get("noteIds")).stream()
                .limit(maxNotes)
                .toList();
            values.put("documentGroupId", documentGroupId);
            values.put("maxNotes", maxNotes);
            if (!noteIds.isEmpty()) {
                values.put("noteIds", noteIds);
            }
            return new ScopeSpec(documentGroupId, noteIds, maxNotes, values);
        }

        private static String stringValue(Object value) {
            return value == null ? "" : value.toString();
        }

        private static List<String> stringValues(Object value) {
            if (!(value instanceof List<?> list)) {
                return List.of();
            }
            LinkedHashSet<String> values = new LinkedHashSet<>();
            for (Object item : list) {
                if (item != null && StringUtils.hasText(item.toString())) {
                    values.add(item.toString().trim());
                }
            }
            return List.copyOf(values);
        }
    }

    private record ClusteringAttempt(String llmRunId, String content) {
    }
}
