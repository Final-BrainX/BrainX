package com.brainx.intelligence.llmops.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public record PromptVersion(
    String promptVersionId,
    String promptKey,
    int version,
    PromptVersionStatus status,
    String template,
    Map<String, Object> variableSchema,
    Instant createdAt,
    Instant activatedAt
) {

    public PromptVersion {
        promptVersionId = promptVersionId == null || promptVersionId.isBlank()
            ? promptKey + ":" + version
            : promptVersionId.trim();
        promptKey = requireText(promptKey, "promptKey");
        status = status == null ? PromptVersionStatus.DRAFT : status;
        template = requireText(template, "template");
        variableSchema = variableSchema == null || variableSchema.isEmpty()
            ? Map.of()
            : Map.copyOf(new LinkedHashMap<>(variableSchema));
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public PromptVersion active(Instant activatedAt) {
        return new PromptVersion(promptVersionId, promptKey, version, PromptVersionStatus.ACTIVE, template, variableSchema, createdAt, activatedAt);
    }

    public PromptVersion archived() {
        return new PromptVersion(promptVersionId, promptKey, version, PromptVersionStatus.ARCHIVED, template, variableSchema, createdAt, activatedAt);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
