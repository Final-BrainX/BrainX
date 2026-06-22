package com.brainx.intelligence.shared.application.port.outbound;

import java.math.BigDecimal;

/**
 * 토큰 사용 기록 요청을 외부 사용량 집계 흐름으로 전달하기 위한 출력 포트입니다.
 */
public interface TokenUsagePort {

    void recordTokenUsage(TokenUsageRecord record);

    record TokenUsageRecord(
        String usageRequestId,
        String userId,
        String sourceService,
        String featureId,
        String modelId,
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        BigDecimal estimatedInputCost,
        BigDecimal estimatedCachedInputCost,
        BigDecimal estimatedOutputCost,
        BigDecimal estimatedCost,
        String costCurrency,
        String causationId
    ) {
        public TokenUsageRecord {
            inputTokens = Math.max(0, inputTokens);
            cachedInputTokens = Math.max(0, Math.min(cachedInputTokens, inputTokens));
            billableInputTokens = Math.max(0, Math.min(billableInputTokens, inputTokens - cachedInputTokens));
            outputTokens = Math.max(0, outputTokens);
            reasoningTokens = Math.max(0, reasoningTokens);
            totalTokens = totalTokens < 0 ? inputTokens + outputTokens : totalTokens;
            costCurrency = costCurrency == null || costCurrency.isBlank()
                ? null
                : costCurrency.trim().toUpperCase();
        }

        public TokenUsageRecord(
            String usageRequestId,
            String userId,
            String sourceService,
            String featureId,
            String modelId,
            int inputTokens,
            int outputTokens,
            BigDecimal estimatedCost,
            String causationId
        ) {
            this(
                usageRequestId,
                userId,
                sourceService,
                featureId,
                modelId,
                inputTokens,
                0,
                inputTokens,
                outputTokens,
                0,
                inputTokens + outputTokens,
                null,
                null,
                null,
                estimatedCost,
                null,
                causationId
            );
        }
    }
}
