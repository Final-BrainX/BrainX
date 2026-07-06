package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.LlmRunStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_llm_runs")
public class LlmRunJpaEntity {

    @Id
    @Column(name = "llm_run_id", nullable = false, length = 120)
    private String llmRunId;

    @Column(name = "user_id", length = 120)
    private String userId;

    @Column(name = "feature_id", length = 120)
    private String featureId;

    @Column(name = "target_type", length = 80)
    private String targetType;

    @Column(name = "target_id", length = 160)
    private String targetId;

    @Column(name = "prompt_key", length = 160)
    private String promptKey;

    @Column(name = "prompt_version", length = 40)
    private String promptVersion;

    @Column(name = "model_id", length = 120)
    private String modelId;

    @Column(name = "provider", length = 80)
    private String provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private LlmRunStatus status;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "cached_input_tokens")
    private Integer cachedInputTokens;

    @Column(name = "billable_input_tokens")
    private Integer billableInputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "reasoning_tokens")
    private Integer reasoningTokens;

    @Column(name = "total_tokens")
    private Integer totalTokens;

    @Column(name = "estimated_input_cost", precision = 18, scale = 8)
    private BigDecimal estimatedInputCost;

    @Column(name = "estimated_cached_input_cost", precision = 18, scale = 8)
    private BigDecimal estimatedCachedInputCost;

    @Column(name = "estimated_output_cost", precision = 18, scale = 8)
    private BigDecimal estimatedOutputCost;

    @Column(name = "estimated_cost", precision = 18, scale = 8)
    private BigDecimal estimatedCost;

    @Column(name = "cost_currency", length = 3)
    private String costCurrency;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "input_preview_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> inputPreview = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "output_preview_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> outputPreview = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "metadata_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> metadata = Map.of();

    @Column(name = "error_code", length = 120)
    private String errorCode;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected LlmRunJpaEntity() {
    }

    static LlmRunJpaEntity fromDomain(LlmRun run) {
        LlmRunJpaEntity entity = new LlmRunJpaEntity();
        entity.llmRunId = run.llmRunId();
        entity.userId = run.userId();
        entity.featureId = run.featureId();
        entity.targetType = run.targetType();
        entity.targetId = run.targetId();
        entity.promptKey = run.promptKey();
        entity.promptVersion = run.promptVersion();
        entity.modelId = run.modelId();
        entity.provider = run.provider();
        entity.status = run.status();
        entity.latencyMs = run.latencyMs();
        entity.inputTokens = run.inputTokens();
        entity.cachedInputTokens = run.cachedInputTokens();
        entity.billableInputTokens = run.billableInputTokens();
        entity.outputTokens = run.outputTokens();
        entity.reasoningTokens = run.reasoningTokens();
        entity.totalTokens = run.totalTokens();
        entity.estimatedInputCost = run.estimatedInputCost();
        entity.estimatedCachedInputCost = run.estimatedCachedInputCost();
        entity.estimatedOutputCost = run.estimatedOutputCost();
        entity.estimatedCost = run.estimatedCost();
        entity.costCurrency = run.costCurrency();
        entity.inputPreview = run.inputPreview();
        entity.outputPreview = run.outputPreview();
        entity.metadata = run.metadata();
        entity.errorCode = run.errorCode();
        entity.errorMessage = run.errorMessage();
        entity.startedAt = run.startedAt();
        entity.completedAt = run.completedAt();
        return entity;
    }

    LlmRun toDomain() {
        return new LlmRun(
            llmRunId,
            userId,
            featureId,
            targetType,
            targetId,
            promptKey,
            promptVersion,
            modelId,
            provider,
            status,
            latencyMs,
            inputTokens,
            cachedInputTokens,
            billableInputTokens,
            outputTokens,
            reasoningTokens,
            totalTokens,
            estimatedInputCost,
            estimatedCachedInputCost,
            estimatedOutputCost,
            estimatedCost,
            costCurrency,
            inputPreview,
            outputPreview,
            metadata,
            errorCode,
            errorMessage,
            startedAt,
            completedAt
        );
    }
}
