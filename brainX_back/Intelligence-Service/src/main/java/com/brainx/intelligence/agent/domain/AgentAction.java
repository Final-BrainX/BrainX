package com.brainx.intelligence.agent.domain;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record AgentAction(
    String actionId,
    String userId,
    String threadId,
    String messageId,
    AgentActionType actionType,
    AgentActionStatus status,
    String title,
    String summary,
    String previewMarkdown,
    String documentGroupId,
    Map<String, Object> target,
    Map<String, Object> payload,
    Map<String, Object> result,
    Map<String, Object> error,
    Instant createdAt,
    Instant decidedAt,
    Instant executedAt
) {

    public AgentAction {
        actionId = requireText(actionId, "actionId");
        userId = requireText(userId, "userId");
        threadId = requireText(threadId, "threadId");
        messageId = requireText(messageId, "messageId");
        if (actionType == null) {
            throw new AgentDomainException("actionType must not be null.");
        }
        if (status == null) {
            throw new AgentDomainException("status must not be null.");
        }
        title = requireText(title, "title");
        summary = summary == null ? "" : summary.trim();
        previewMarkdown = previewMarkdown == null ? "" : previewMarkdown.trim();
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        target = immutableMap(target);
        payload = immutableMap(payload);
        result = immutableNullableMap(result);
        error = immutableNullableMap(error);
        createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public AgentAction withStatus(AgentActionStatus nextStatus, Instant now) {
        return new AgentAction(
            actionId,
            userId,
            threadId,
            messageId,
            actionType,
            nextStatus,
            title,
            summary,
            previewMarkdown,
            documentGroupId,
            target,
            payload,
            result,
            error,
            createdAt,
            nextStatus == AgentActionStatus.APPROVED || nextStatus == AgentActionStatus.REJECTED ? now : decidedAt,
            executedAt
        );
    }

    public AgentAction succeeded(Map<String, Object> executionResult, Instant now) {
        return new AgentAction(
            actionId,
            userId,
            threadId,
            messageId,
            actionType,
            AgentActionStatus.SUCCEEDED,
            title,
            summary,
            previewMarkdown,
            documentGroupId,
            target,
            payload,
            executionResult,
            null,
            createdAt,
            decidedAt == null ? now : decidedAt,
            now
        );
    }

    public AgentAction failed(String code, String message, Instant now) {
        return new AgentAction(
            actionId,
            userId,
            threadId,
            messageId,
            actionType,
            AgentActionStatus.FAILED,
            title,
            summary,
            previewMarkdown,
            documentGroupId,
            target,
            payload,
            result,
            Map.of(
                "code", code == null || code.isBlank() ? "AGENT_ACTION_FAILED" : code,
                "message", message == null || message.isBlank() ? "Agent action failed." : message
            ),
            createdAt,
            decidedAt == null ? now : decidedAt,
            now
        );
    }

    public boolean pendingApproval() {
        return status == AgentActionStatus.PENDING_APPROVAL;
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

    private static Map<String, Object> immutableNullableMap(Map<String, Object> values) {
        if (values == null) {
            return null;
        }
        return immutableMap(values);
    }
}
