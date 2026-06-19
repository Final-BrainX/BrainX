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
        int outputTokens,
        BigDecimal estimatedCost,
        String causationId
    ) {
    }
}
