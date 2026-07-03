package com.brainx.intelligence.chat.domain;

import java.time.Instant;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record ChatThread(
    String threadId,
    String userId,
    String documentGroupId,
    String title,
    String modelId,
    Instant createdAt,
    Instant archivedAt,
    Instant deletedAt
) {

    public ChatThread {
        threadId = requireText(threadId, "threadId");
        userId = requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        title = requireText(title, "title");
        modelId = requireText(modelId, "modelId");
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public ChatThread(
        String threadId,
        String userId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt
    ) {
        this(threadId, userId, documentGroupId, title, modelId, createdAt, null, null);
    }

    public boolean archived() {
        return archivedAt != null;
    }

    public boolean deleted() {
        return deletedAt != null;
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ChatDomainException(name + " must not be blank.");
        }
        return value.trim();
    }
}
