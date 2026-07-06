package com.brainx.intelligence.llmops.domain;

import java.time.Instant;

public record EvalSet(
    String evalSetId,
    String name,
    String description,
    Instant createdAt
) {

    public EvalSet {
        evalSetId = requireText(evalSetId, "evalSetId");
        name = requireText(name, "name");
        description = description == null || description.isBlank() ? null : description.trim();
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
