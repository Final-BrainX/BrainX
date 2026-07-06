package com.brainx.intelligence.llmops.domain;

import java.time.Instant;

public record EvalRun(
    String evalRunId,
    String evalSetId,
    EvalRunStatus status,
    String modelId,
    int scenarioCount,
    int passedCount,
    int failedCount,
    EvalFailureType failureType,
    String failureMessage,
    Instant createdAt,
    Instant completedAt
) {

    public EvalRun {
        evalRunId = requireText(evalRunId, "evalRunId");
        evalSetId = requireText(evalSetId, "evalSetId");
        status = status == null ? EvalRunStatus.RUNNING : status;
        modelId = modelId == null || modelId.isBlank() ? null : modelId.trim();
        failureMessage = failureMessage == null || failureMessage.isBlank() ? null : failureMessage.trim();
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public EvalRun completed(int scenarioCount, int passedCount, int failedCount, EvalFailureType failureType, String failureMessage, Instant completedAt) {
        return new EvalRun(evalRunId, evalSetId, EvalRunStatus.COMPLETED, modelId, scenarioCount, passedCount, failedCount, failureType, failureMessage, createdAt, completedAt);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
