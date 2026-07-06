package com.brainx.intelligence.agent.domain;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public record AgentMessage(
    String messageId,
    String threadId,
    String userId,
    AgentRole role,
    String content,
    String modelId,
    Map<String, Object> clientContext,
    Instant createdAt
) {

    public AgentMessage {
        messageId = requireText(messageId, "messageId");
        threadId = requireText(threadId, "threadId");
        userId = requireText(userId, "userId");
        if (role == null) {
            throw new AgentDomainException("role must not be null.");
        }
        content = requireText(content, "content");
        modelId = modelId == null || modelId.isBlank() ? null : modelId.trim();
        clientContext = immutableMap(clientContext);
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public static AgentMessage user(
        String messageId,
        String threadId,
        String userId,
        String content,
        String modelId,
        Map<String, Object> clientContext,
        Instant createdAt
    ) {
        return new AgentMessage(messageId, threadId, userId, AgentRole.USER, content, modelId, clientContext, createdAt);
    }

    public static AgentMessage agent(
        String messageId,
        String threadId,
        String userId,
        String content,
        String modelId,
        Instant createdAt
    ) {
        return new AgentMessage(messageId, threadId, userId, AgentRole.AGENT, content, modelId, Map.of(), createdAt);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new AgentDomainException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static Map<String, Object> immutableMap(Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(values));
    }
}
