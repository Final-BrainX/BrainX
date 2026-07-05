package com.brainx.intelligence.agent.domain;

import java.time.Instant;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record AgentThread(
    String threadId,
    String userId,
    String documentGroupId,
    String title,
    String modelId,
    Instant createdAt
) {

    public AgentThread {
        threadId = requireText(threadId, "threadId");
        userId = requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        title = requireText(title, "title");
        modelId = requireText(modelId, "modelId");
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new AgentDomainException(name + " must not be blank.");
        }
        return value.trim();
    }
}
