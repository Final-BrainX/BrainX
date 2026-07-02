package com.brainx.intelligence.chat.application.port.inbound;

import java.time.Instant;

public interface CreateChatThreadUseCase {

    ChatThreadResult createChatThread(CreateChatThreadCommand command);

    record CreateChatThreadCommand(
        String userId,
        String documentGroupId,
        String title,
        String initialMessage,
        String modelId
    ) {
    }

    record ChatThreadResult(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant archivedAt,
        Instant deletedAt
    ) {
        public ChatThreadResult(
            String threadId,
            String documentGroupId,
            String title,
            String modelId,
            Instant createdAt
        ) {
            this(threadId, documentGroupId, title, modelId, createdAt, null, null);
        }
    }
}
