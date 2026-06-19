package com.brainx.intelligence.infrastructure.events.consumer;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;

public record BrainxEventEnvelope(
    String eventId,
    String eventType,
    Integer eventVersion,
    Instant occurredAt,
    String producer,
    String tenantId,
    String userId,
    String correlationId,
    String causationId,
    String idempotencyKey,
    JsonNode payload
) {

    void validate() {
        requireText(eventId, "eventId");
        requireText(eventType, "eventType");
        if (eventVersion == null) {
            throw new EventProcessingException(false, "INVALID_ENVELOPE", "eventVersion must be present.");
        }
        if (occurredAt == null) {
            throw new EventProcessingException(false, "INVALID_ENVELOPE", "occurredAt must be present.");
        }
        requireText(producer, "producer");
        requireText(correlationId, "correlationId");
        if (payload == null || payload.isNull()) {
            throw new EventProcessingException(false, "INVALID_ENVELOPE", "payload must be present.");
        }
    }

    public String noteIdOrNull() {
        if (payload == null || !payload.hasNonNull("noteId")) {
            return null;
        }
        String noteId = payload.get("noteId").asText();
        return noteId.isBlank() ? null : noteId;
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new EventProcessingException(false, "INVALID_ENVELOPE", name + " must not be blank.");
        }
    }
}
