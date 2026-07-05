package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentRole;
import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_agent_messages")
public class AgentMessageJpaEntity {

    @Id
    @Column(name = "message_id", nullable = false, length = 120)
    private String messageId;

    @Column(name = "thread_id", nullable = false, length = 120)
    private String threadId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private AgentRole role;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "content", nullable = false)
    private String content;

    @Column(name = "model_id", length = 120)
    private String modelId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "client_context", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> clientContext = Map.of();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AgentMessageJpaEntity() {
    }

    static AgentMessageJpaEntity fromDomain(AgentMessage message) {
        AgentMessageJpaEntity entity = new AgentMessageJpaEntity();
        entity.messageId = message.messageId();
        entity.threadId = message.threadId();
        entity.userId = message.userId();
        entity.role = message.role();
        entity.content = message.content();
        entity.modelId = message.modelId();
        entity.clientContext = message.clientContext();
        entity.createdAt = message.createdAt();
        return entity;
    }

    AgentMessage toDomain() {
        return new AgentMessage(
            messageId,
            threadId,
            userId,
            role,
            content,
            modelId,
            clientContext,
            createdAt
        );
    }

    String content() {
        return content;
    }
}
