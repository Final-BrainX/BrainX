package com.brainx.intelligence.chat.application.port.inbound;

import java.time.Instant;

public interface UpdateChatThreadUseCase {

    ChatThreadUpdateResult updateChatThread(UpdateChatThreadCommand command);

    ChatThreadDeleteResult deleteChatThread(DeleteChatThreadCommand command);

    record UpdateChatThreadCommand(
        String userId,
        String threadId,
        boolean archived
    ) {
    }

    record DeleteChatThreadCommand(
        String userId,
        String threadId
    ) {
    }

    record ChatThreadUpdateResult(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant archivedAt,
        Instant deletedAt
    ) {
    }

    record ChatThreadDeleteResult(
        String threadId,
        Instant deletedAt
    ) {
    }
}
