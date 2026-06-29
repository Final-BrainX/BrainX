package com.brainx.intelligence.chat.domain;

import java.time.Instant;

public record ChatThreadSummary(
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
