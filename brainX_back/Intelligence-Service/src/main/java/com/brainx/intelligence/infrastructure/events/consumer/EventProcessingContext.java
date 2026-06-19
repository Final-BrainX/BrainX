package com.brainx.intelligence.infrastructure.events.consumer;

import com.fasterxml.jackson.databind.JsonNode;

public record EventProcessingContext(BrainxEventEnvelope envelope) {

    public String eventId() {
        return envelope.eventId();
    }

    public String eventType() {
        return envelope.eventType();
    }

    public String correlationId() {
        return envelope.correlationId();
    }

    public String causationId() {
        return envelope.causationId();
    }

    public JsonNode payload() {
        return envelope.payload();
    }
}
