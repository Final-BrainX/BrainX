package com.brainx.intelligence.llmops.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record EvalResult(
    String resultId,
    String evalRunId,
    String scenarioId,
    EvalResultStatus status,
    Map<String, Object> output,
    EvalFailureType failureType,
    String failureMessage,
    String llmRunId,
    Long latencyMs,
    Instant createdAt
) {

    public EvalResult {
        resultId = requireText(resultId, "resultId");
        evalRunId = requireText(evalRunId, "evalRunId");
        scenarioId = requireText(scenarioId, "scenarioId");
        status = status == null ? EvalResultStatus.FAILED : status;
        output = output == null || output.isEmpty() ? Map.of() : Map.copyOf(new LinkedHashMap<>(output));
        failureMessage = failureMessage == null || failureMessage.isBlank() ? null : failureMessage.trim();
        llmRunId = llmRunId == null || llmRunId.isBlank() ? null : llmRunId.trim();
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
