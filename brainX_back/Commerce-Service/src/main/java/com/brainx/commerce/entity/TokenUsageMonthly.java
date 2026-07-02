package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * (userId, yearMonth, featureId)별 월별 토큰 사용량 집계(기능별 소계). 총합은 조회 시 SUM.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_token_usage_monthly")
public class TokenUsageMonthly {
    @EmbeddedId
    private TokenUsageMonthlyId id;
    @Column(name = "total_tokens", nullable = false)
    private long totalTokens;
    @Column(name = "estimated_cost", nullable = false, precision = 14, scale = 6)
    private BigDecimal estimatedCost;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public TokenUsageMonthly(TokenUsageMonthlyId id, long totalTokens, BigDecimal estimatedCost, Instant updatedAt) {
        this.id = id;
        this.totalTokens = totalTokens;
        this.estimatedCost = estimatedCost;
        this.updatedAt = updatedAt;
    }
}
