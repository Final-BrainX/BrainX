package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.time.Instant;

import com.brainx.intelligence.chat.domain.ChatThread;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_chat_threads")
public class ChatThreadJpaEntity {

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

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected ChatThreadJpaEntity() {
    }

    private ChatThreadJpaEntity(
        String threadId,
        String userId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant archivedAt,
        Instant deletedAt
    ) {
        this.threadId = threadId;
        this.userId = userId;
        this.documentGroupId = documentGroupId;
        this.title = title;
        this.modelId = modelId;
        this.createdAt = createdAt;
        this.archivedAt = archivedAt;
        this.deletedAt = deletedAt;
    }

    static ChatThreadJpaEntity fromDomain(ChatThread thread) {
        return new ChatThreadJpaEntity(
            thread.threadId(),
            thread.userId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt(),
            thread.archivedAt(),
            thread.deletedAt()
        );
    }

    ChatThread toDomain() {
        return new ChatThread(threadId, userId, documentGroupId, title, modelId, createdAt, archivedAt, deletedAt);
    }

    void archive(Instant archivedAt) {
        this.archivedAt = archivedAt;
    }

    void unarchive() {
        this.archivedAt = null;
    }

    void delete(Instant deletedAt) {
        this.deletedAt = deletedAt;
    }
}
