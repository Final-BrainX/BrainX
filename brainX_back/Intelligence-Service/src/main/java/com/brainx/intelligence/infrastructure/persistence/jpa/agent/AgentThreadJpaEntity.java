package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.time.Instant;

import com.brainx.intelligence.agent.domain.AgentThread;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_agent_threads")
public class AgentThreadJpaEntity {

    @Id
    @Column(name = "thread_id", nullable = false, length = 120)
    private String threadId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "document_group_id", nullable = false, length = 120)
    private String documentGroupId;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    @Column(name = "model_id", nullable = false, length = 120)
    private String modelId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AgentThreadJpaEntity() {
    }

    private AgentThreadJpaEntity(
        String threadId,
        String userId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt
    ) {
        this.threadId = threadId;
        this.userId = userId;
        this.documentGroupId = documentGroupId;
        this.title = title;
        this.modelId = modelId;
        this.createdAt = createdAt;
    }

    static AgentThreadJpaEntity fromDomain(AgentThread thread) {
        return new AgentThreadJpaEntity(
            thread.threadId(),
            thread.userId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt()
        );
    }

    AgentThread toDomain() {
        return new AgentThread(threadId, userId, documentGroupId, title, modelId, createdAt);
    }
}
