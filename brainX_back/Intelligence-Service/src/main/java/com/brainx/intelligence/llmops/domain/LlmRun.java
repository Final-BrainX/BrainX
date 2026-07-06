package com.brainx.intelligence.llmops.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record LlmRun(
    String llmRunId,
    String userId,
    String featureId,
    String targetType,
    String targetId,
    String promptKey,
    String promptVersion,
    String modelId,
    String provider,
    LlmRunStatus status,
    Long latencyMs,
    Integer inputTokens,
    Integer cachedInputTokens,
    Integer billableInputTokens,
    Integer outputTokens,
    Integer reasoningTokens,
    Integer totalTokens,
    BigDecimal estimatedInputCost,
    BigDecimal estimatedCachedInputCost,
    BigDecimal estimatedOutputCost,
    BigDecimal estimatedCost,
    String costCurrency,
    Map<String, Object> inputPreview,
    Map<String, Object> outputPreview,
    Map<String, Object> metadata,
    String errorCode,
    String errorMessage,
    Instant startedAt,
    Instant completedAt
) {

    public LlmRun {
        llmRunId = requireText(llmRunId, "llmRunId");
        userId = normalize(userId);
        featureId = normalize(featureId);
        targetType = normalize(targetType);
        targetId = normalize(targetId);
        promptKey = normalize(promptKey);
        promptVersion = normalize(promptVersion);
        modelId = normalize(modelId);
        provider = normalize(provider);
        status = status == null ? LlmRunStatus.RUNNING : status;
        inputPreview = immutableMap(inputPreview);
        outputPreview = immutableMap(outputPreview);
        metadata = immutableMap(metadata);
        errorCode = normalize(errorCode);
        errorMessage = normalize(errorMessage);
        startedAt = startedAt == null ? Instant.now() : startedAt;
    }

    public LlmRun succeeded(
        Long latencyMs,
        Integer inputTokens,
        Integer cachedInputTokens,
        Integer billableInputTokens,
        Integer outputTokens,
        Integer reasoningTokens,
        Integer totalTokens,
        BigDecimal estimatedInputCost,
        BigDecimal estimatedCachedInputCost,
        BigDecimal estimatedOutputCost,
        BigDecimal estimatedCost,
        String costCurrency,
        Map<String, Object> outputPreview,
        Instant completedAt
    ) {
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
            LlmRunStatus.SUCCEEDED,
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
            null,
            null,
            startedAt,
            completedAt
        );
    }

    public LlmRun failed(Long latencyMs, String errorCode, String errorMessage, Instant completedAt) {
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
            LlmRunStatus.FAILED,
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

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Map<String, Object> immutableMap(Map<String, Object> values) {
        return values == null || values.isEmpty() ? Map.of() : Map.copyOf(new LinkedHashMap<>(values));
    }
}
