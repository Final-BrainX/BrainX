package com.brainx.intelligence.insight.application.usecase;

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

import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportCompletedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportRequestedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightReportStore;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightNotFoundException;
import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.insight.domain.InsightReport;
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
public class InsightService implements RequestInsightReportUseCase, GetInsightReportUseCase {

    static final String INSIGHT_REPORT_CAPABILITY = "INSIGHT_REPORT";
    static final String INSIGHT_REPORT_FEATURE_ID = "insight-report-chat";
    private static final int HARD_MAX_NOTES = 50;
    private static final int HARD_MAX_RECOMMENDATIONS = 20;

    private final InsightReportStore insightReportStore;
    private final KnowledgeAnalysisNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final InsightEventPort insightEventPort;
    private final InsightProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public InsightService(
        InsightReportStore insightReportStore,
        KnowledgeAnalysisNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        InsightEventPort insightEventPort,
        InsightProperties properties,
        ObjectMapper objectMapper
    ) {
        this(
            insightReportStore,
            noteSourcePort,
            entitlementPort,
            aiModelSettingsPort,
            aiChatPort,
            aiUsageRecorder,
            insightEventPort,
            properties,
            objectMapper,
            Clock.systemUTC()
        );
    }

    InsightService(
        InsightReportStore insightReportStore,
        KnowledgeAnalysisNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        InsightEventPort insightEventPort,
        InsightProperties properties,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.insightReportStore = insightReportStore;
        this.noteSourcePort = noteSourcePort;
        this.entitlementPort = entitlementPort;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.insightEventPort = insightEventPort;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Override
    @Transactional
    public InsightReport requestInsightReport(InsightReportCommand command) {
        String userId = requireText(command.userId(), "userId");
        String idempotencyKey = normalizeNullable(command.idempotencyKey());
        if (idempotencyKey != null) {
            var existing = insightReportStore.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        ScopeSpec scope = ScopeSpec.from(command.scope(), properties.getMaxNotes());
        boolean includeLearningRecommendations = Boolean.TRUE.equals(command.includeLearningRecommendations());
        List<KnowledgeAnalysisNote> notes = loadNotes(userId, scope);
        if (notes.isEmpty()) {
            throw new InsightConflictException("No searchable notes are available for insight report.");
        }

        String modelId = resolveModelId(userId);
        int maxRecommendations = Math.min(properties.getMaxRecommendations(), HARD_MAX_RECOMMENDATIONS);
        String systemPrompt = systemPrompt(includeLearningRecommendations, maxRecommendations);
        String userPrompt = userPrompt(notes, includeLearningRecommendations, maxRecommendations);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            INSIGHT_REPORT_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new InsightForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }

        String reportId = UUID.randomUUID().toString();
        Instant now = Instant.now(clock);
        InsightReport running = insightReportStore.save(InsightReport.running(
            reportId,
            userId,
            scope.documentGroupId(),
            scope.normalizedScope(),
            includeLearningRecommendations,
            modelId,
            idempotencyKey,
            now
        ));
        insightEventPort.insightReportRequested(new InsightReportRequestedEvent(
            userId,
            reportId,
            running.scope(),
            includeLearningRecommendations
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
            recordUsage(userId, modelId, reportId, response == null ? null : response.tokenUsage());
            ParsedInsight parsed = parseInsight(content, notes, includeLearningRecommendations, maxRecommendations);
            InsightReport completed = insightReportStore.save(running.completed(
                parsed.summary(),
                parsed.knowledgeGaps(),
                parsed.recommendations(),
                Instant.now(clock)
            ));
            insightEventPort.insightReportCompleted(new InsightReportCompletedEvent(
                userId,
                reportId,
                parsed.knowledgeGaps().size(),
                parsed.recommendations().size()
            ));
            return completed;
        } catch (RuntimeException exception) {
            return insightReportStore.save(running.failed(safeFailureMessage(exception), Instant.now(clock)));
        }
    }

    @Override
    @Transactional(readOnly = true)
    public InsightReport getInsightReport(GetInsightReportQuery query) {
        return insightReportStore.findByUserIdAndReportId(
                requireText(query.userId(), "userId"),
                requireText(query.reportId(), "reportId")
            )
            .orElseThrow(() -> new InsightNotFoundException("Insight report was not found."));
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
            throw new InsightNotFoundException("Insight source notes are not available: " + String.join(", ", missing));
        }
        return notes;
    }

    private String resolveModelId(String userId) {
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseGet(() -> requireText(properties.getDefaultModel(), "brainx.insight.default-model"));
    }

    private String userPrompt(
        List<KnowledgeAnalysisNote> notes,
        boolean includeLearningRecommendations,
        int maxRecommendations
    ) {
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

            Produce a knowledge insight report from only these note cards.
            includeLearningRecommendations=%s, maxRecommendations=%d.
            Do not invent note IDs.
            """.formatted(toJson(noteCards), includeLearningRecommendations, maxRecommendations);
    }

    private static String systemPrompt(boolean includeLearningRecommendations, int maxRecommendations) {
        String learningInstruction = includeLearningRecommendations
            ? "Learning recommendations are allowed."
            : "Do not include recommendations whose type is LEARNING_RECOMMENDATION, LEARNING, or STUDY_PLAN.";
        return """
            You are BrainX knowledge insight analyst.
            Return only strict JSON object:
            {
              "summary": "Korean paragraph",
              "knowledgeGaps": ["Korean gap"],
              "recommendations": [
                {"type":"GAP_FILL|REFINE|CONNECT|REVIEW|LEARNING_RECOMMENDATION", "title":"...", "reason":"...", "noteIds":["..."], "priority":"HIGH|MEDIUM|LOW"}
              ]
            }
            Use at most %d recommendations. %s
            Do not return markdown fences, prose, or additional top-level fields.
            """.formatted(maxRecommendations, learningInstruction);
    }

    private ParsedInsight parseInsight(
        String content,
        List<KnowledgeAnalysisNote> notes,
        boolean includeLearningRecommendations,
        int maxRecommendations
    ) {
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (!root.isObject()) {
                throw new IllegalArgumentException("Insight response must be a JSON object.");
            }
            LinkedHashSet<String> allowedNoteIds = new LinkedHashSet<>();
            notes.forEach(note -> allowedNoteIds.add(note.noteId()));
            List<InsightRecommendation> recommendations = new ArrayList<>();
            JsonNode recommendationNodes = root.path("recommendations");
            if (recommendationNodes.isArray()) {
                for (JsonNode node : recommendationNodes) {
                    if (recommendations.size() >= maxRecommendations) {
                        break;
                    }
                    InsightRecommendation recommendation = recommendation(node, allowedNoteIds);
                    if (!StringUtils.hasText(recommendation.title())) {
                        continue;
                    }
                    if (!includeLearningRecommendations && learningRecommendation(recommendation.type())) {
                        continue;
                    }
                    recommendations.add(recommendation);
                }
            }
            String summary = text(root, "summary");
            List<String> knowledgeGaps = stringList(root.path("knowledgeGaps"));
            if (!StringUtils.hasText(summary) && knowledgeGaps.isEmpty() && recommendations.isEmpty()) {
                throw new IllegalArgumentException("Insight response did not contain usable data.");
            }
            return new ParsedInsight(summary, knowledgeGaps, recommendations);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Insight response was not valid JSON.", exception);
        }
    }

    private InsightRecommendation recommendation(JsonNode node, LinkedHashSet<String> allowedNoteIds) {
        List<String> noteIds = stringList(node.path("noteIds")).stream()
            .filter(allowedNoteIds::contains)
            .toList();
        return new InsightRecommendation(
            text(node, "type"),
            text(node, "title"),
            text(node, "reason"),
            noteIds,
            text(node, "priority")
        );
    }

    private void recordUsage(
        String userId,
        String modelId,
        String reportId,
        AiTokenUsage tokenUsage
    ) {
        aiUsageRecorder.recordChatUsage(userId, INSIGHT_REPORT_FEATURE_ID, modelId, reportId, tokenUsage);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            return String.valueOf(value);
        }
    }

    private static boolean learningRecommendation(String type) {
        String normalized = type == null ? "" : type.trim().toUpperCase();
        return normalized.contains("LEARNING") || normalized.contains("STUDY");
    }

    private static int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(text.length() / 4.0d));
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

    private record ParsedInsight(
        String summary,
        List<String> knowledgeGaps,
        List<InsightRecommendation> recommendations
    ) {
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
