package com.brainx.commerce.event;

import com.brainx.commerce.entity.EventOutbox;
import com.brainx.commerce.repository.EventOutboxRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CommerceEventPublisher {
    private static final String PRODUCER = "Commerce-Service";
    private final EventOutboxRepository outboxRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ObjectMapper objectMapper;

    public void publish(String eventType, String userId, Map<String, Object> payload) {
        Instant now = Instant.now();
        String eventId = "evt_" + UUID.randomUUID();
        String correlationId = stringValue(payload, "correlationId");
        if (correlationId == null) {
            correlationId = "req_" + UUID.randomUUID();
        }
        String causationId = stringValue(payload, "causationId");
        String idempotencyKey = stringValue(payload, "idempotencyKey");
        CommerceEvent event = new CommerceEvent(
                eventId,
                eventType,
                1,
                now,
                PRODUCER,
                null,
                userId,
                correlationId,
                causationId,
                idempotencyKey,
                channel(eventType),
                payload
        );
        outboxRepository.save(new EventOutbox(
                event.eventId(),
                event.eventType(),
                event.eventVersion(),
                event.occurredAt(),
                event.producer(),
                event.tenantId(),
                event.userId(),
                event.correlationId(),
                event.causationId(),
                event.idempotencyKey(),
                event.channel(),
                toJson(event.payload())
        ));
        applicationEventPublisher.publishEvent(event);
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize event payload.", exception);
        }
    }

    private String stringValue(Map<String, Object> payload, String key) {
        Object value = payload == null ? null : payload.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    private String channel(String eventType) {
        return switch (eventType) {
            case "CheckoutSessionCreated" -> "brainx.commerce.operations.checkout-session-created.v1";
            case "SubscriptionChanged" -> "brainx.commerce.operations.subscription-changed.v1";
            case "PaymentSucceeded" -> "brainx.commerce.operations.payment-succeeded.v1";
            case "PaymentFailed" -> "brainx.commerce.operations.payment-failed.v1";
            case "PaymentRefunded" -> "brainx.commerce.operations.payment-refunded.v1";
            case "InvoiceIssued" -> "brainx.commerce.operations.invoice-issued.v1";
            default -> "brainx.commerce.operations.unknown.v1";
        };
    }
}
