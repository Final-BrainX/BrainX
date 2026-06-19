package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.Optional;

public interface EventConsumptionStore {

    Optional<EventConsumptionRecord> findByEventId(String eventId);

    EventConsumptionRecord markProcessing(BrainxEventEnvelope envelope, String payloadHash);

    EventConsumptionRecord markProcessed(String eventId);

    EventConsumptionRecord markFailed(String eventId, boolean retryable, String errorCode, String errorMessage);

    EventConsumptionRecord recordPoisonMessage(String rawBody, String errorCode, String errorMessage);
}
