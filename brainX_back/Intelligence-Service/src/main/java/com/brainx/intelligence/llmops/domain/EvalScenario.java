package com.brainx.intelligence.llmops.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record EvalScenario(
    String scenarioId,
    String evalSetId,
    EvalScenarioType scenarioType,
    String name,
    Map<String, Object> input,
    Map<String, Object> validation,
    Instant createdAt
) {

    public EvalScenario {
        scenarioId = requireText(scenarioId, "scenarioId");
        evalSetId = requireText(evalSetId, "evalSetId");
        scenarioType = scenarioType == null ? EvalScenarioType.PROMPT_COMPLETION : scenarioType;
        name = name == null || name.isBlank() ? scenarioId : name.trim();
        input = input == null || input.isEmpty() ? Map.of() : Map.copyOf(new LinkedHashMap<>(input));
        validation = validation == null || validation.isEmpty() ? Map.of() : Map.copyOf(new LinkedHashMap<>(validation));
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
