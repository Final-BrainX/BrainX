package com.brainx.intelligence.llmops.domain;

import java.time.Instant;

public record LlmFeedback(
    String feedbackId,
    String userId,
    String llmRunId,
    LlmFeedbackRating rating,
    String reasonCode,
    String comment,
    Instant createdAt,
    Instant updatedAt
) {

    public LlmFeedback {
        feedbackId = requireText(feedbackId, "feedbackId");
        userId = requireText(userId, "userId");
        llmRunId = requireText(llmRunId, "llmRunId");
        if (rating == null) {
            throw new IllegalArgumentException("rating must not be null.");
        }
        reasonCode = normalize(reasonCode);
        comment = normalize(comment);
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
