package com.brainx.intelligence.chat.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ChatMessage(
    String messageId,
    String threadId,
    String userId,
    ChatRole role,
    String content,
    String modelId,
    Map<String, Object> noteScope,
    Map<String, Object> clientContext,
    List<ChatCitation> citations,
    ChatTokenUsage tokenUsage,
    String llmRunId,
    Instant createdAt
) {

    public ChatMessage {
        messageId = requireText(messageId, "messageId");
        threadId = requireText(threadId, "threadId");
        userId = requireText(userId, "userId");
        if (role == null) {
            throw new ChatDomainException("role must not be null.");
        }
        content = requireText(content, "content");
        modelId = modelId == null || modelId.isBlank() ? null : modelId.trim();
        noteScope = immutableMap(noteScope);
        clientContext = immutableMap(clientContext);
        citations = immutableList(citations);
        llmRunId = llmRunId == null || llmRunId.isBlank() ? null : llmRunId.trim();
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public static ChatMessage user(
        String messageId,
        String threadId,
        String userId,
        String content,
        String modelId,
        Map<String, Object> noteScope,
        Map<String, Object> clientContext,
        Instant createdAt
    ) {
        return new ChatMessage(
            messageId,
            threadId,
            userId,
            ChatRole.USER,
            content,
            modelId,
            noteScope,
            clientContext,
            List.of(),
            null,
            null,
            createdAt
        );
    }

    public static ChatMessage assistant(
        String messageId,
        String threadId,
        String userId,
        String content,
        String modelId,
        List<ChatCitation> citations,
        ChatTokenUsage tokenUsage,
        String llmRunId,
        Instant createdAt
    ) {
        return new ChatMessage(
            messageId,
            threadId,
            userId,
            ChatRole.ASSISTANT,
            content,
            modelId,
            Map.of(),
            Map.of(),
            citations,
            tokenUsage,
            llmRunId,
            createdAt
        );
    }

    public static ChatMessage assistant(
        String messageId,
        String threadId,
        String userId,
        String content,
        String modelId,
        List<ChatCitation> citations,
        ChatTokenUsage tokenUsage,
        Instant createdAt
    ) {
        return assistant(messageId, threadId, userId, content, modelId, citations, tokenUsage, null, createdAt);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ChatDomainException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static Map<String, Object> immutableMap(Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(values));
    }

    private static List<ChatCitation> immutableList(List<ChatCitation> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return Collections.unmodifiableList(new ArrayList<>(values));
    }
}
