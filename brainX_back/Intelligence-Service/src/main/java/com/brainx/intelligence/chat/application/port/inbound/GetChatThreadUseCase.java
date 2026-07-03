package com.brainx.intelligence.chat.application.port.inbound;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface GetChatThreadUseCase {

    ChatThreadDetailResult getChatThread(GetChatThreadQuery query);

    record GetChatThreadQuery(
        String userId,
        String threadId
    ) {
    }

    record ChatThreadDetailResult(
        ThreadView thread,
        List<Map<String, Object>> messages
    ) {
    }

    record ThreadView(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant archivedAt,
        Instant deletedAt
    ) {
        public ThreadView(
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
