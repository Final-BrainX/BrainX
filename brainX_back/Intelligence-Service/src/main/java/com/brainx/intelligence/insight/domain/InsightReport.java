package com.brainx.intelligence.insight.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record InsightReport(
    String reportId,
    String userId,
    String documentGroupId,
    InsightReportStatus status,
    Map<String, Object> scope,
    boolean includeLearningRecommendations,
    String summary,
    List<String> knowledgeGaps,
    List<InsightRecommendation> recommendations,
    String modelId,
    String llmRunId,
    String idempotencyKey,
    String failureMessage,
    Instant createdAt,
    Instant completedAt
) {

    public InsightReport {
        reportId = requireText(reportId, "reportId");
        userId = requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        status = status == null ? InsightReportStatus.PENDING : status;
        scope = scope == null ? Map.of() : new LinkedHashMap<>(scope);
        summary = summary == null ? null : summary.trim();
        knowledgeGaps = knowledgeGaps == null ? List.of() : knowledgeGaps.stream()
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .distinct()
            .toList();
        recommendations = recommendations == null ? List.of() : List.copyOf(recommendations);
        modelId = modelId == null ? "" : modelId;
        llmRunId = normalizeNullable(llmRunId);
        idempotencyKey = normalizeNullable(idempotencyKey);
        failureMessage = normalizeNullable(failureMessage);
        createdAt = createdAt == null ? Instant.EPOCH : createdAt;
    }

    public InsightReport(
        String reportId,
        String userId,
        String documentGroupId,
        InsightReportStatus status,
        Map<String, Object> scope,
        boolean includeLearningRecommendations,
        String summary,
        List<String> knowledgeGaps,
        List<InsightRecommendation> recommendations,
        String modelId,
        String idempotencyKey,
        String failureMessage,
        Instant createdAt,
        Instant completedAt
    ) {
        this(
            reportId,
            userId,
            documentGroupId,
            status,
            scope,
            includeLearningRecommendations,
            summary,
            knowledgeGaps,
            recommendations,
            modelId,
            null,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    public static InsightReport running(
        String reportId,
        String userId,
        String documentGroupId,
        Map<String, Object> scope,
        boolean includeLearningRecommendations,
        String modelId,
        String idempotencyKey,
        Instant createdAt
    ) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            InsightReportStatus.RUNNING,
            scope,
            includeLearningRecommendations,
            null,
            List.of(),
            List.of(),
            modelId,
            null,
            idempotencyKey,
            null,
            createdAt,
            null
        );
    }

    public InsightReport completed(
        String completedSummary,
        List<String> completedKnowledgeGaps,
        List<InsightRecommendation> completedRecommendations,
        Instant completedAt
    ) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            InsightReportStatus.COMPLETED,
            scope,
            includeLearningRecommendations,
            completedSummary,
            completedKnowledgeGaps,
            completedRecommendations,
            modelId,
            llmRunId,
            idempotencyKey,
            null,
            createdAt,
            completedAt
        );
    }

    public InsightReport failed(String message, Instant completedAt) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            InsightReportStatus.FAILED,
            scope,
            includeLearningRecommendations,
            null,
            List.of(),
            List.of(),
            modelId,
            llmRunId,
            idempotencyKey,
            message,
            createdAt,
            completedAt
        );
    }

    public InsightReport withLlmRunId(String llmRunId) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            status,
            scope,
            includeLearningRecommendations,
            summary,
            knowledgeGaps,
            recommendations,
            modelId,
            llmRunId,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
