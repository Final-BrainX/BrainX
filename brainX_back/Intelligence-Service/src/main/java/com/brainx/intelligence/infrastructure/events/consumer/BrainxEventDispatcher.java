package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class BrainxEventDispatcher {

    private static final Logger LOGGER = LoggerFactory.getLogger(BrainxEventDispatcher.class);

    private final ObjectMapper objectMapper;
    private final EventConsumptionStore eventConsumptionStore;
    private final Map<String, BrainxEventHandler> handlersByEventType;

    public BrainxEventDispatcher(
        ObjectMapper objectMapper,
        EventConsumptionStore eventConsumptionStore,
        List<BrainxEventHandler> handlers
    ) {
        this.objectMapper = objectMapper;
        this.eventConsumptionStore = eventConsumptionStore;
        this.handlersByEventType = handlersByEventType(handlers);
    }

    public EventDispatchResult dispatch(String rawBody) {
        BrainxEventEnvelope envelope = parseEnvelope(rawBody);
        if (envelope == null) {
            var poison = eventConsumptionStore.recordPoisonMessage(
                rawBody == null ? "" : rawBody,
                "INVALID_ENVELOPE",
                "Invalid event envelope."
            );
            return EventDispatchResult.notHandled(poison);
        }
        String eventId = envelope.eventId();
        var existing = eventConsumptionStore.findByEventId(eventId);
        if (existing.isPresent() && existing.get().processed()) {
            LOGGER.info("Skipping already processed event eventId={} eventType={}", eventId, envelope.eventType());
            return EventDispatchResult.skipped(existing.get());
        }

        eventConsumptionStore.markProcessing(envelope, EventHash.sha256(rawBody));
        BrainxEventHandler handler = handlersByEventType.get(envelope.eventType());
        if (handler == null) {
            var failed = eventConsumptionStore.markFailed(
                eventId,
                false,
                "NO_HANDLER",
                "No event handler registered for " + envelope.eventType()
            );
            LOGGER.warn(
                "No handler for event eventId={} eventType={} userId={} noteId={} correlationId={}",
                envelope.eventId(),
                envelope.eventType(),
                envelope.userId(),
                envelope.noteIdOrNull(),
                envelope.correlationId()
            );
            return EventDispatchResult.notHandled(failed);
        }

        try {
            handler.handle(new EventProcessingContext(envelope));
            var processed = eventConsumptionStore.markProcessed(eventId);
            LOGGER.info(
                "Processed event eventId={} eventType={} userId={} noteId={} correlationId={}",
                envelope.eventId(),
                envelope.eventType(),
                envelope.userId(),
                envelope.noteIdOrNull(),
                envelope.correlationId()
            );
            return EventDispatchResult.handled(processed);
        } catch (EventProcessingException exception) {
            eventConsumptionStore.markFailed(
                eventId,
                exception.retryable(),
                exception.errorCode(),
                EventFailureSanitizer.safeMessage(exception)
            );
            if (exception.retryable()) {
                throw exception;
            }
            return EventDispatchResult.handled(eventConsumptionStore.findByEventId(eventId).orElseThrow());
        } catch (RuntimeException exception) {
            eventConsumptionStore.markFailed(
                eventId,
                true,
                "UNEXPECTED_ERROR",
                EventFailureSanitizer.safeMessage(exception)
            );
            throw EventProcessingException.retryable("UNEXPECTED_ERROR", "Unexpected event processing failure.");
        }
    }

    private BrainxEventEnvelope parseEnvelope(String rawBody) {
        try {
            BrainxEventEnvelope envelope = objectMapper.readValue(rawBody, BrainxEventEnvelope.class);
            envelope.validate();
            return envelope;
        } catch (JsonProcessingException | EventProcessingException exception) {
            return null;
        }
    }

    private static Map<String, BrainxEventHandler> handlersByEventType(List<BrainxEventHandler> handlers) {
        Map<String, BrainxEventHandler> values = new HashMap<>();
        for (BrainxEventHandler handler : handlers) {
            for (String eventType : handler.eventTypes()) {
                BrainxEventHandler previous = values.putIfAbsent(eventType, handler);
                if (previous != null) {
                    throw new IllegalStateException("Duplicate BrainX event handler for " + eventType);
                }
            }
        }
        return Map.copyOf(values);
    }
}
