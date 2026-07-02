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
 * (userId, usageDate, featureId)별 일별 토큰 사용량 집계. 복합키 자체가 유니크 제약이라
 * 별도 UNIQUE 제약을 추가하지 않고, native upsert(ON CONFLICT)로 누적한다.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_token_usage_daily")
public class TokenUsageDaily {
    @EmbeddedId
    private TokenUsageDailyId id;
    @Column(name = "total_tokens", nullable = false)
    private long totalTokens;
    @Column(name = "estimated_cost", nullable = false, precision = 14, scale = 6)
    private BigDecimal estimatedCost;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public TokenUsageDaily(TokenUsageDailyId id, long totalTokens, BigDecimal estimatedCost, Instant updatedAt) {
        this.id = id;
        this.totalTokens = totalTokens;
        this.estimatedCost = estimatedCost;
        this.updatedAt = updatedAt;
    }
}
