package com.brainx.intelligence.insight.application.usecase;

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

import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.GetLatestInsightReportQuery;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.LatestInsightReport;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportCompletedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportRequestedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightReportStore;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightNotFoundException;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportLatestState;
import com.brainx.intelligence.insight.domain.InsightReportStatus;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
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
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class InsightService implements RequestInsightReportUseCase, GetInsightReportUseCase, GetLatestInsightReportUseCase {

    static final String INSIGHT_REPORT_CAPABILITY = "INSIGHT_REPORT";
    static final String INSIGHT_REPORT_FEATURE_ID = "insight-report-chat";
    static final String SOURCE_SNAPSHOT_SCOPE_KEY = "_sourceSnapshot";
    private static final int HARD_MAX_NOTES = 50;
    private static final int HARD_MAX_RECOMMENDATIONS = 20;
    private static final int LATEST_REPORT_LOOKBACK = 20;

    private final InsightReportStore insightReportStore;
    private final KnowledgeAnalysisNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final InsightEventPort insightEventPort;
    private final InsightProperties properties;
    private final ObjectMapper objectMapper;
    private final InsightResponseParser insightResponseParser;
    private final StylePromptCompiler stylePromptCompiler;
    private final Clock clock;

    @Autowired
    public InsightService(
        InsightReportStore insightReportStore,
        KnowledgeAnalysisNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        InsightEventPort insightEventPort,
        InsightProperties properties,
        ObjectMapper objectMapper,
        StylePromptCompiler stylePromptCompiler
    ) {
        this(
            insightReportStore,
            noteSourcePort,
            entitlementPort,
            aiModelSettingsPort,
            aiChatPort,
            aiUsageRecorder,
            aiRunRecorder,
            promptRegistryService,
            insightEventPort,
            properties,
            objectMapper,
            stylePromptCompiler,
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
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        InsightEventPort insightEventPort,
        InsightProperties properties,
        ObjectMapper objectMapper,
        StylePromptCompiler stylePromptCompiler,
        Clock clock
    ) {
        this.insightReportStore = insightReportStore;
        this.noteSourcePort = noteSourcePort;
        this.entitlementPort = entitlementPort;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.insightEventPort = insightEventPort;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.insightResponseParser = new InsightResponseParser(objectMapper);
        this.stylePromptCompiler = stylePromptCompiler;
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
        PromptResolution promptResolution = promptRegistryService.resolve("insight-report", systemPrompt());
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                promptResolution.template(),
                runtimeInstructions(includeLearningRecommendations, maxRecommendations)
            ),
            stylePromptCompiler.writingStyleInstructions(userId)
        );
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
            scopeWithSourceSnapshot(scope.normalizedScope(), notes),
            includeLearningRecommendations,
            modelId,
            idempotencyKey,
            now
        ));
        insightEventPort.insightReportRequested(new InsightReportRequestedEvent(
            userId,
            reportId,
            publicScope(running.scope()),
            includeLearningRecommendations
        ));

        try {
            List<AiChatMessage> messages = List.of(
                new AiChatMessage(AiRole.SYSTEM, systemPrompt),
                new AiChatMessage(AiRole.USER, userPrompt)
            );
            AiRunRecorder.RecordedChatResponse recorded = aiRunRecorder.recordChatGenerateWithRun(
                userId,
                INSIGHT_REPORT_FEATURE_ID,
                promptResolution.promptKey(),
                promptResolution.version(),
                modelId,
                "INSIGHT_REPORT",
                reportId,
                messages,
                Map.of("documentGroupId", scope.documentGroupId()),
                () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
            );
            AiChatResponse response = recorded.response();
            String content = response == null || response.content() == null ? "" : response.content();
            recordUsage(userId, modelId, reportId, response == null ? null : response.tokenUsage());
            ParsedInsight parsed = insightResponseParser.parseInsight(
                content,
                notes,
                includeLearningRecommendations,
                maxRecommendations
            );
            InsightReport completed = insightReportStore.save(running.withLlmRunId(recorded.llmRunId()).completed(
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

    @Override
    @Transactional(readOnly = true)
    public LatestInsightReport getLatestInsightReport(GetLatestInsightReportQuery query) {
        String userId = requireText(query.userId(), "userId");
        String documentGroupId = requireText(query.documentGroupId(), "documentGroupId");
        List<KnowledgeAnalysisNote> notes = noteSourcePort.findAnalysisNotes(
            userId,
            documentGroupId,
            Math.min(properties.getMaxNotes(), HARD_MAX_NOTES)
        );
        Instant latestNoteUpdatedAt = latestNoteUpdatedAt(notes);
        if (notes.isEmpty()) {
            return new LatestInsightReport(
                documentGroupId,
                0,
                null,
                InsightReportLatestState.NO_SOURCE_NOTES,
                null
            );
        }

        InsightReport latestReport = insightReportStore.findRecentByUserIdAndDocumentGroupId(
                userId,
                documentGroupId,
                LATEST_REPORT_LOOKBACK
            ).stream()
            .filter(InsightService::isWorkspaceInsightReport)
            .findFirst()
            .orElse(null);
        if (latestReport == null) {
            return new LatestInsightReport(
                documentGroupId,
                notes.size(),
                latestNoteUpdatedAt,
                InsightReportLatestState.NOT_ANALYZED,
                null
            );
        }

        return new LatestInsightReport(
            documentGroupId,
            notes.size(),
            latestNoteUpdatedAt,
            latestState(latestReport, notes),
            latestReport
        );
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

    private static String systemPrompt() {
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
            Do not return markdown fences, prose, or additional top-level fields.
            """;
    }

    private static String runtimeInstructions(boolean includeLearningRecommendations, int maxRecommendations) {
        String learningInstruction = includeLearningRecommendations
            ? "Learning recommendations are allowed."
            : "Do not include recommendations whose type is LEARNING_RECOMMENDATION, LEARNING, or STUDY_PLAN.";
        return "Use at most %d recommendations. %s".formatted(maxRecommendations, learningInstruction);
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

    private static String safeFailureMessage(RuntimeException exception) {
        String message = exception.getMessage();
        if (!StringUtils.hasText(message)) {
            message = exception.getClass().getSimpleName();
        }
        return message.length() > 300 ? message.substring(0, 300) : message;
    }

    private static Map<String, Object> scopeWithSourceSnapshot(
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

    private static InsightReportLatestState latestState(InsightReport report, List<KnowledgeAnalysisNote> notes) {
        if (report.status() == InsightReportStatus.FAILED) {
            return InsightReportLatestState.FAILED;
        }
        if (report.status() != InsightReportStatus.COMPLETED) {
            return InsightReportLatestState.STALE;
        }
        return sourceSnapshotMatches(report.scope().get(SOURCE_SNAPSHOT_SCOPE_KEY), notes)
            ? InsightReportLatestState.FRESH
            : InsightReportLatestState.STALE;
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

    private static boolean isWorkspaceInsightReport(InsightReport report) {
        return !hasScopedNoteIds(publicScope(report.scope()));
    }

    private static boolean hasScopedNoteIds(Map<String, Object> scope) {
        Object noteIds = scope == null ? null : scope.get("noteIds");
        if (!(noteIds instanceof List<?> list)) {
            return false;
        }
        return list.stream()
            .anyMatch(item -> item != null && StringUtils.hasText(item.toString()));
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
            String documentGroupId = requireText(stringValue(values.get("documentGroupId")), "scope.documentGroupId");
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
