package com.brainx.intelligence.infrastructure.persistence.jpa.insight;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_insight_reports")
public class InsightReportJpaEntity {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<InsightRecommendation>> RECOMMENDATION_LIST_TYPE = new TypeReference<>() {
    };

    @Id
    @Column(name = "report_id", nullable = false, length = 120)
    private String reportId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "document_group_id", nullable = false, length = 120)
    private String documentGroupId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private InsightReportStatus status;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "scope_json", nullable = false)
    private String scopeJson;

    @Column(name = "include_learning_recommendations", nullable = false)
    private boolean includeLearningRecommendations;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "summary")
    private String summary;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "knowledge_gaps_json", nullable = false)
    private String knowledgeGapsJson;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "recommendations_json", nullable = false)
    private String recommendationsJson;

    @Column(name = "model_id", nullable = false, length = 120)
    private String modelId;

    @Column(name = "llm_run_id", length = 120)
    private String llmRunId;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected InsightReportJpaEntity() {
    }

    static InsightReportJpaEntity fromDomain(InsightReport report, ObjectMapper objectMapper) {
        InsightReportJpaEntity entity = new InsightReportJpaEntity();
        entity.reportId = report.reportId();
        entity.userId = report.userId();
        entity.documentGroupId = report.documentGroupId();
        entity.status = report.status();
        entity.scopeJson = toJson(objectMapper, report.scope());
        entity.includeLearningRecommendations = report.includeLearningRecommendations();
        entity.summary = report.summary();
        entity.knowledgeGapsJson = toJson(objectMapper, report.knowledgeGaps());
        entity.recommendationsJson = toJson(objectMapper, report.recommendations());
        entity.modelId = report.modelId();
        entity.llmRunId = report.llmRunId();
        entity.idempotencyKey = report.idempotencyKey();
        entity.failureMessage = report.failureMessage();
        entity.createdAt = report.createdAt();
        entity.completedAt = report.completedAt();
        return entity;
    }

    InsightReport toDomain(ObjectMapper objectMapper) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            status,
            fromJson(objectMapper, scopeJson, MAP_TYPE, Map.of()),
            includeLearningRecommendations,
            summary,
            fromJson(objectMapper, knowledgeGapsJson, STRING_LIST_TYPE, List.of()),
            fromJson(objectMapper, recommendationsJson, RECOMMENDATION_LIST_TYPE, List.of()),
            modelId,
            llmRunId,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    private static String toJson(ObjectMapper objectMapper, Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize insight report JSON.", exception);
        }
    }

    private static <T> T fromJson(ObjectMapper objectMapper, String value, TypeReference<T> type, T defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize insight report JSON.", exception);
        }
    }
}
