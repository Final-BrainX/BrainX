package com.brainx.intelligence.shared.application.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingResponse;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;

@Service
public class AiUsageRecorder {

    private static final String SOURCE_SERVICE = "Intelligence-Service";

    private final TokenUsagePort tokenUsagePort;
    private final AiTokenUsageCostEstimator usageCostEstimator;

    public AiUsageRecorder(
        TokenUsagePort tokenUsagePort,
        AiTokenUsageCostEstimator usageCostEstimator
    ) {
        this.tokenUsagePort = tokenUsagePort;
        this.usageCostEstimator = usageCostEstimator;
    }

    public void recordChatUsage(
        String userId,
        String featureId,
        String modelId,
        String causationId,
        AiTokenUsage tokenUsage
    ) {
        if (tokenUsage == null || !tokenUsage.hasKnownTokens()) {
            return;
        }
        recordRawUsage(
            userId,
            featureId,
            modelId,
            causationId,
            tokenUsage.promptTokens(),
            tokenUsage.cachedPromptTokens(),
            tokenUsage.completionTokens(),
            tokenUsage.reasoningTokens(),
            tokenUsage.totalTokens()
        );
    }

    public void recordEmbeddingUsage(
        String userId,
        String featureId,
        String causationId,
        AiEmbeddingResponse embedding
    ) {
        if (embedding == null || embedding.totalTokens() == null || embedding.totalTokens() <= 0) {
            return;
        }
        recordRawUsage(
            userId,
            featureId,
            embedding.modelId(),
            causationId,
            embedding.totalTokens(),
            0,
            0,
            0,
            embedding.totalTokens()
        );
    }

    public void recordRawUsage(
        String userId,
        String featureId,
        String modelId,
        String causationId,
        Integer inputTokens,
        Integer cachedInputTokens,
        Integer outputTokens,
        Integer reasoningTokens,
        Integer totalTokens
    ) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(featureId)) {
            return;
        }
        if (inputTokens == null
            && cachedInputTokens == null
            && outputTokens == null
            && reasoningTokens == null
            && totalTokens == null) {
            return;
        }

        int normalizedInputTokens = tokenCount(inputTokens);
        int normalizedCachedInputTokens = Math.min(tokenCount(cachedInputTokens), normalizedInputTokens);
        int normalizedOutputTokens = tokenCount(outputTokens);
        int normalizedReasoningTokens = tokenCount(reasoningTokens);
        int normalizedTotalTokens = totalTokens == null
            ? normalizedInputTokens + normalizedOutputTokens
            : Math.max(0, totalTokens);
        if (normalizedInputTokens == 0
            && normalizedCachedInputTokens == 0
            && normalizedOutputTokens == 0
            && normalizedReasoningTokens == 0
            && normalizedTotalTokens == 0) {
            return;
        }

        TokenCostEstimate cost = usageCostEstimator.estimate(
            modelId,
            normalizedInputTokens,
            normalizedCachedInputTokens,
            normalizedOutputTokens
        );
        tokenUsagePort.recordTokenUsage(new TokenUsageRecord(
            UUID.randomUUID().toString(),
            userId,
            SOURCE_SERVICE,
            featureId,
            modelId,
            normalizedInputTokens,
            normalizedCachedInputTokens,
            Math.max(0, normalizedInputTokens - normalizedCachedInputTokens),
            normalizedOutputTokens,
            normalizedReasoningTokens,
            normalizedTotalTokens,
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode(),
            StringUtils.hasText(causationId) ? causationId : UUID.randomUUID().toString()
        ));
    }

    private static int tokenCount(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }
}
