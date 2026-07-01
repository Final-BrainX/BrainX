package com.brainx.intelligence.clustering.application.usecase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
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
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobCompletedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobRequestedEvent;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.brainx.intelligence.clustering.domain.ClusteringForbiddenException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ClusteringService implements RequestClusterJobUseCase, GetClusterJobUseCase {

    static final String AI_CLUSTERING_CAPABILITY = "AI_CLUSTERING";
    static final String AI_CLUSTERING_FEATURE_ID = "ai-clustering-chat";
    private static final int HARD_MAX_NOTES = 50;
    private static final int HARD_MAX_CLUSTERS = 12;

    private final ClusterJobStore clusterJobStore;
    private final KnowledgeAnalysisNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final ClusteringEventPort clusteringEventPort;
    private final ClusteringProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public ClusteringService(
        ClusterJobStore clusterJobStore,
        KnowledgeAnalysisNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
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
            clusteringEventPort,
            properties,
            objectMapper,
            Clock.systemUTC()
        );
    }

    ClusteringService(
        ClusterJobStore clusterJobStore,
        KnowledgeAnalysisNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
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
        this.clusteringEventPort = clusteringEventPort;
        this.properties = properties;
        this.objectMapper = objectMapper;
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
        String systemPrompt = systemPrompt(maxClusters);
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
            scope.normalizedScope(),
            algorithmOptions,
            modelId,
            idempotencyKey,
            now
        ));
        clusteringEventPort.clusterJobRequested(new ClusterJobRequestedEvent(
            userId,
            clusterJobId,
            running.scope(),
            running.algorithmOptions()
        ));

        try {
            AiChatResponse response = aiChatPort.generate(new AiChatRequest(
                modelId,
                List.of(
                    new AiChatMessage(AiRole.SYSTEM, systemPrompt),
                    new AiChatMessage(AiRole.USER, userPrompt)
                )
            ));
            String content = response == null || response.content() == null ? "" : response.content();
            recordUsage(userId, modelId, clusterJobId, response == null ? null : response.tokenUsage());
            List<Cluster> clusters = parseClusters(clusterJobId, content, notes, maxClusters);
            ClusterJob completed = clusterJobStore.save(running.completed(clusters, Instant.now(clock)));
            clusteringEventPort.clusterJobCompleted(new ClusterJobCompletedEvent(
                userId,
                clusterJobId,
                clusters.size()
            ));
            return completed;
        } catch (RuntimeException exception) {
            return clusterJobStore.save(running.failed(safeFailureMessage(exception), Instant.now(clock)));
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

    private List<KnowledgeAnalysisNote> loadNotes(String userId, ScopeSpec scope) {
        if (scope.noteIds().isEmpty()) {
            return noteSourcePort.findAnalysisNotes(userId, scope.documentGroupId(), scope.maxNotes());
        }
        List<KnowledgeAnalysisNote> notes = noteSourcePort.findAnalysisNotesByIds(
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
        return """
            Note cards from one document group:
            %s

            Group these notes into at most %d meaningful knowledge clusters.
            Use only these note cards. Do not invent note IDs.
            """.formatted(toJson(noteCards), maxClusters);
    }

    private static String systemPrompt(int maxClusters) {
        return """
            You are BrainX knowledge structure analyst.
            Return only a strict JSON array with at most %d cluster objects.
            Each object must contain:
            - title: concise Korean cluster title
            - summary: one Korean sentence explaining the cluster
            - noteIds: array of source note IDs in this cluster
            - keywords: array of 2 to 6 Korean or technical keywords
            - confidence: number from 0 to 1
            Do not return markdown fences, prose, or additional fields.
            """.formatted(maxClusters);
    }

    private List<Cluster> parseClusters(
        String clusterJobId,
        String content,
        List<KnowledgeAnalysisNote> notes,
        int maxClusters
    ) {
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (root.has("clusters")) {
                root = root.get("clusters");
            }
            if (!root.isArray()) {
                throw new IllegalArgumentException("Cluster response must be a JSON array.");
            }
            LinkedHashSet<String> allowedNoteIds = new LinkedHashSet<>();
            notes.forEach(note -> allowedNoteIds.add(note.noteId()));
            List<Cluster> clusters = new ArrayList<>();
            for (JsonNode node : root) {
                if (clusters.size() >= maxClusters) {
                    break;
                }
                String title = text(node, "title");
                if (!StringUtils.hasText(title)) {
                    continue;
                }
                List<String> noteIds = stringList(node.path("noteIds")).stream()
                    .filter(allowedNoteIds::contains)
                    .toList();
                if (noteIds.isEmpty()) {
                    continue;
                }
                int ordinal = clusters.size() + 1;
                clusters.add(new Cluster(
                    clusterId(clusterJobId, ordinal, title),
                    title,
                    text(node, "summary"),
                    noteIds,
                    stringList(node.path("keywords")),
                    doubleValue(node.path("confidence"), 0.0d)
                ));
            }
            if (clusters.isEmpty()) {
                throw new IllegalArgumentException("Cluster response did not contain valid clusters.");
            }
            return clusters;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Cluster response was not valid JSON.", exception);
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

    private static double doubleValue(JsonNode node, double defaultValue) {
        if (node != null && node.isNumber()) {
            return node.asDouble();
        }
        if (node != null && node.isTextual()) {
            try {
                return Double.parseDouble(node.asText());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return "";
        }
        String text = value.asText("");
        return text == null ? "" : text.trim();
    }

    private static List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.asText("");
            if (StringUtils.hasText(value)) {
                values.add(value.trim());
            }
        }
        return values.stream().distinct().toList();
    }

    private static String jsonPayload(String content) {
        if (content == null) {
            return "";
        }
        String text = content.trim();
        if (text.startsWith("```")) {
            int firstLineEnd = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstLineEnd >= 0 && lastFence > firstLineEnd) {
                return text.substring(firstLineEnd + 1, lastFence).trim();
            }
        }
        return text;
    }

    private static String clusterId(String clusterJobId, int ordinal, String title) {
        return "cluster-" + sha256(clusterJobId + ":" + ordinal + ":" + title).substring(0, 16);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
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
}
