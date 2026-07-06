package com.brainx.intelligence.agent.domain;

import java.time.Instant;

public record AgentThreadSummary(
    String threadId,
    String userId,
    String documentGroupId,
    String title,
    String modelId,
    Instant createdAt,
    Instant lastMessageAt,
    String lastMessagePreview,
    long messageCount
) {
}
