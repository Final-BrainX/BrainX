package com.brainx.commerce.repository;

import com.brainx.commerce.entity.TokenUsageDaily;
import com.brainx.commerce.entity.TokenUsageDailyId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface TokenUsageDailyRepository extends JpaRepository<TokenUsageDaily, TokenUsageDailyId> {

    @Modifying
    @Query(value = """
            INSERT INTO commerce_token_usage_daily (user_id, usage_date, feature_id, total_tokens, estimated_cost, updated_at)
            VALUES (:userId, :usageDate, :featureId, :tokens, :cost, now())
            ON CONFLICT (user_id, usage_date, feature_id)
            DO UPDATE SET total_tokens = commerce_token_usage_daily.total_tokens + EXCLUDED.total_tokens,
                          estimated_cost = commerce_token_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                          updated_at = now()
            """, nativeQuery = true)
    void upsert(@Param("userId") String userId, @Param("usageDate") LocalDate usageDate,
                @Param("featureId") String featureId, @Param("tokens") long tokens, @Param("cost") BigDecimal cost);

    @Query("""
            SELECT d.id.usageDate AS usageDate, SUM(d.totalTokens) AS totalTokens, SUM(d.estimatedCost) AS estimatedCost
            FROM TokenUsageDaily d
            WHERE d.id.userId = :userId AND d.id.usageDate BETWEEN :from AND :to
            GROUP BY d.id.usageDate
            """)
    List<DailyTotal> sumByUserAndDateRange(@Param("userId") String userId, @Param("from") LocalDate from,
                                            @Param("to") LocalDate to);

    interface DailyTotal {
        LocalDate getUsageDate();
        long getTotalTokens();
        BigDecimal getEstimatedCost();
    }
}
