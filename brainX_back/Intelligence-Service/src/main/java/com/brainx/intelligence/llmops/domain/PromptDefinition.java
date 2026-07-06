package com.brainx.intelligence.llmops.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record PromptDefinition(
    String promptKey,
    String featureId,
    String description,
    Map<String, Object> variableSchema,
    Instant createdAt,
    Instant updatedAt
) {

    public PromptDefinition {
        promptKey = requireText(promptKey, "promptKey");
        featureId = normalize(featureId);
        description = normalize(description);
        variableSchema = variableSchema == null || variableSchema.isEmpty()
            ? Map.of()
            : Map.copyOf(new LinkedHashMap<>(variableSchema));
        createdAt = createdAt == null ? Instant.now() : createdAt;
        updatedAt = updatedAt == null ? createdAt : updatedAt;
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
}
