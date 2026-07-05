package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentActionType;
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
@Table(name = "intelligence_agent_actions")
public class AgentActionJpaEntity {

    @Id
    @Column(name = "action_id", nullable = false, length = 120)
    private String actionId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "thread_id", nullable = false, length = 120)
    private String threadId;

    @Column(name = "message_id", nullable = false, length = 120)
    private String messageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 40)
    private AgentActionType actionType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private AgentActionStatus status;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    @Column(name = "summary", nullable = false, length = 1000)
    private String summary;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "preview_markdown", nullable = false)
    private String previewMarkdown;

    @Column(name = "document_group_id", nullable = false, length = 120)
    private String documentGroupId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "target_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> target = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "payload_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> payload = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "result_json")
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> result;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "error_json")
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "executed_at")
    private Instant executedAt;

    protected AgentActionJpaEntity() {
    }

    static AgentActionJpaEntity fromDomain(AgentAction action) {
        AgentActionJpaEntity entity = new AgentActionJpaEntity();
        entity.actionId = action.actionId();
        entity.userId = action.userId();
        entity.threadId = action.threadId();
        entity.messageId = action.messageId();
        entity.actionType = action.actionType();
        entity.status = action.status();
        entity.title = action.title();
        entity.summary = action.summary();
        entity.previewMarkdown = action.previewMarkdown();
        entity.documentGroupId = action.documentGroupId();
        entity.target = action.target();
        entity.payload = action.payload();
        entity.result = action.result();
        entity.error = action.error();
        entity.createdAt = action.createdAt();
        entity.decidedAt = action.decidedAt();
        entity.executedAt = action.executedAt();
        return entity;
    }

    AgentAction toDomain() {
        return new AgentAction(
            actionId,
            userId,
            threadId,
            messageId,
            actionType,
            status,
            title,
            summary,
            previewMarkdown,
            documentGroupId,
            target,
            payload,
            result,
            error,
            createdAt,
            decidedAt,
            executedAt
        );
    }
}
