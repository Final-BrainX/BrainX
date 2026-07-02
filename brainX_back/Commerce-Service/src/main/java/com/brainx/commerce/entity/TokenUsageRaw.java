package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Intelligence-Service가 발행한 TokenUsageRecordedRequested 원본 이벤트 로그.
 * event_id가 PK이므로 이 테이블 자체가 Kafka consumer의 멱등성 판정 근거가 된다.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_token_usage_raw",
        indexes = @Index(name = "idx_token_usage_raw_user", columnList = "user_id, occurred_at"))
public class TokenUsageRaw {
    @Id
    @Column(name = "event_id")
    private String eventId;
    @Column(name = "usage_request_id", nullable = false)
    private String usageRequestId;
    @Column(name = "user_id", nullable = false)
    private String userId;
    @Column(name = "source_service", nullable = false)
    private String sourceService;
    @Column(name = "feature_id", nullable = false)
    private String featureId;
    @Column(name = "model_id")
    private String modelId;
    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;
    @Column(name = "cached_input_tokens", nullable = false)
    private int cachedInputTokens;
    @Column(name = "billable_input_tokens", nullable = false)
    private int billableInputTokens;
    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;
    @Column(name = "reasoning_tokens", nullable = false)
    private int reasoningTokens;
    @Column(name = "total_tokens", nullable = false)
    private int totalTokens;
    @Column(name = "estimated_cost", precision = 12, scale = 6)
    private BigDecimal estimatedCost;
    @Column(name = "cost_currency")
    private String costCurrency;
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    public TokenUsageRaw(String eventId, String usageRequestId, String userId, String sourceService,
                          String featureId, String modelId, int inputTokens, int cachedInputTokens,
                          int billableInputTokens, int outputTokens, int reasoningTokens, int totalTokens,
                          BigDecimal estimatedCost, String costCurrency, Instant occurredAt, Instant receivedAt) {
        this.eventId = eventId;
        this.usageRequestId = usageRequestId;
        this.userId = userId;
        this.sourceService = sourceService;
        this.featureId = featureId;
        this.modelId = modelId;
        this.inputTokens = inputTokens;
        this.cachedInputTokens = cachedInputTokens;
        this.billableInputTokens = billableInputTokens;
        this.outputTokens = outputTokens;
        this.reasoningTokens = reasoningTokens;
        this.totalTokens = totalTokens;
        this.estimatedCost = estimatedCost;
        this.costCurrency = costCurrency;
        this.occurredAt = occurredAt;
        this.receivedAt = receivedAt;
    }
}
