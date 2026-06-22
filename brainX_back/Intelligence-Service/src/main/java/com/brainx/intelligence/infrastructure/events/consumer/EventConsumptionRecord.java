package com.brainx.intelligence.infrastructure.events.consumer;

import java.time.Instant;

public record EventConsumptionRecord(
    String eventId,
    String eventType,
    EventConsumptionStatus status,
    int attempts,
    String errorCode,
    String errorMessage,
    Instant receivedAt,
    Instant processedAt,
    Instant failedAt
) {

    public boolean processed() {
        return status == EventConsumptionStatus.PROCESSED;
    }
}
