package com.brainx.intelligence.infrastructure.persistence.jpa.events;

import java.time.Instant;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventEnvelope;
import com.brainx.intelligence.infrastructure.events.consumer.EventConsumptionRecord;
import com.brainx.intelligence.infrastructure.events.consumer.EventConsumptionStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "event_consumption_records")
public class EventConsumptionJpaEntity {

    @Id
    @Column(name = "event_id", nullable = false, length = 160)
    private String eventId;

    @Column(name = "event_type", nullable = false, length = 120)
    private String eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private EventConsumptionStatus status;

    @Column(name = "event_version")
    private Integer eventVersion;

    @Column(name = "producer", length = 120)
    private String producer;

    @Column(name = "tenant_id", length = 120)
    private String tenantId;

    @Column(name = "user_id", length = 120)
    private String userId;

    @Column(name = "note_id", length = 120)
    private String noteId;

    @Column(name = "correlation_id", length = 160)
    private String correlationId;

    @Column(name = "causation_id", length = 160)
    private String causationId;

    @Column(name = "idempotency_key", length = 160)
    private String idempotencyKey;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "error_code", length = 80)
    private String errorCode;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    protected EventConsumptionJpaEntity() {
    }

    static EventConsumptionJpaEntity processing(BrainxEventEnvelope envelope, String payloadHash, Instant now) {
        EventConsumptionJpaEntity entity = new EventConsumptionJpaEntity();
        entity.eventId = envelope.eventId();
        entity.eventType = envelope.eventType();
        entity.eventVersion = envelope.eventVersion();
        entity.producer = envelope.producer();
        entity.tenantId = envelope.tenantId();
        entity.userId = envelope.userId();
        entity.noteId = envelope.noteIdOrNull();
        entity.correlationId = envelope.correlationId();
        entity.causationId = envelope.causationId();
        entity.idempotencyKey = envelope.idempotencyKey();
        entity.payloadHash = payloadHash;
        entity.receivedAt = now;
        entity.markProcessing(envelope, payloadHash, now);
        return entity;
    }

    static EventConsumptionJpaEntity poison(String eventId, String payloadHash, String errorCode, String errorMessage, Instant now) {
        EventConsumptionJpaEntity entity = new EventConsumptionJpaEntity();
        entity.eventId = eventId;
        entity.eventType = "UNKNOWN";
        entity.status = EventConsumptionStatus.FAILED_NON_RETRYABLE;
        entity.payloadHash = payloadHash;
        entity.attempts = 1;
        entity.errorCode = errorCode;
        entity.errorMessage = errorMessage;
        entity.receivedAt = now;
        entity.failedAt = now;
        return entity;
    }

    void markProcessing(BrainxEventEnvelope envelope, String payloadHash, Instant now) {
        this.eventType = envelope.eventType();
        this.eventVersion = envelope.eventVersion();
        this.producer = envelope.producer();
        this.tenantId = envelope.tenantId();
        this.userId = envelope.userId();
        this.noteId = envelope.noteIdOrNull();
        this.correlationId = envelope.correlationId();
        this.causationId = envelope.causationId();
        this.idempotencyKey = envelope.idempotencyKey();
        this.payloadHash = payloadHash;
        this.status = EventConsumptionStatus.PROCESSING;
        this.attempts++;
        this.errorCode = null;
        this.errorMessage = null;
        this.processedAt = null;
        this.failedAt = null;
        if (this.receivedAt == null) {
            this.receivedAt = now;
        }
    }

    void markProcessed(Instant now) {
        this.status = EventConsumptionStatus.PROCESSED;
        this.processedAt = now;
        this.failedAt = null;
        this.errorCode = null;
        this.errorMessage = null;
    }

    void markFailed(boolean retryable, String errorCode, String errorMessage, Instant now) {
        this.status = retryable ? EventConsumptionStatus.FAILED_RETRYABLE : EventConsumptionStatus.FAILED_NON_RETRYABLE;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.failedAt = now;
    }

    void incrementPoison(String errorCode, String errorMessage, Instant now) {
        this.status = EventConsumptionStatus.FAILED_NON_RETRYABLE;
        this.attempts++;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
        this.failedAt = now;
    }

    EventConsumptionRecord toRecord() {
        return new EventConsumptionRecord(
            eventId,
            eventType,
            status,
            attempts,
            errorCode,
            errorMessage,
            receivedAt,
            processedAt,
            failedAt
        );
    }
}
