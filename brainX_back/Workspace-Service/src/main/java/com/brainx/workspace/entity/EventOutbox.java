package com.brainx.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "workspace_event_outbox")
public class EventOutbox {
    @Id
    private String eventId;
    @Column(nullable = false)
    private String eventType;
    @Column(nullable = false)
    private int eventVersion;
    @Column(nullable = false)
    private Instant occurredAt;
    @Column(nullable = false)
    private String producer;
    private String tenantId;
    private String userId;
    private String correlationId;
    @Column(nullable = false)
    private String channel;
    @Column(columnDefinition = "text", nullable = false)
    private String payloadJson;

    public EventOutbox(String eventId, String eventType, int eventVersion, Instant occurredAt, String producer,
                       String tenantId, String userId, String correlationId, String channel, String payloadJson) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.eventVersion = eventVersion;
        this.occurredAt = occurredAt;
        this.producer = producer;
        this.tenantId = tenantId;
        this.userId = userId;
        this.correlationId = correlationId;
        this.channel = channel;
        this.payloadJson = payloadJson;
    }
}
