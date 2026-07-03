package com.brainx.commerce.repository;

import com.brainx.commerce.entity.TokenUsageMonthly;
import com.brainx.commerce.entity.TokenUsageMonthlyId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface TokenUsageMonthlyRepository extends JpaRepository<TokenUsageMonthly, TokenUsageMonthlyId> {

    @Modifying
    @Query(value = """
            INSERT INTO commerce_token_usage_monthly (user_id, year_month, feature_id, total_tokens, estimated_cost, updated_at)
            VALUES (:userId, :yearMonth, :featureId, :tokens, :cost, now())
            ON CONFLICT (user_id, year_month, feature_id)
            DO UPDATE SET total_tokens = commerce_token_usage_monthly.total_tokens + EXCLUDED.total_tokens,
                          estimated_cost = commerce_token_usage_monthly.estimated_cost + EXCLUDED.estimated_cost,
                          updated_at = now()
            """, nativeQuery = true)
    void upsert(@Param("userId") String userId, @Param("yearMonth") String yearMonth,
                @Param("featureId") String featureId, @Param("tokens") long tokens, @Param("cost") BigDecimal cost);

    List<TokenUsageMonthly> findByIdUserIdAndIdYearMonth(String userId, String yearMonth);
}
