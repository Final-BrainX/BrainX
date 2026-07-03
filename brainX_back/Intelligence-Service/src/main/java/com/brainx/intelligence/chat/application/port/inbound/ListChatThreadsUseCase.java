package com.brainx.intelligence.chat.application.port.inbound;

import java.time.Instant;
import java.util.List;

import com.brainx.intelligence.chat.domain.ChatThreadStatus;

public interface ListChatThreadsUseCase {

    ChatThreadListResult listChatThreads(ListChatThreadsQuery query);

    record ListChatThreadsQuery(
        String userId,
        Integer limit,
        String cursor,
        ChatThreadStatus status
    ) {
        public ListChatThreadsQuery(String userId, Integer limit, String cursor) {
            this(userId, limit, cursor, ChatThreadStatus.ACTIVE);
        }
    }

    record ChatThreadListResult(
        List<ChatThreadListItem> threads,
        ChatThreadListPagination pagination
    ) {
    }

    record ChatThreadListItem(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant archivedAt,
        Instant deletedAt,
        Instant lastMessageAt,
        String lastMessagePreview,
        long messageCount
    ) {
        public ChatThreadListItem(
            String threadId,
            String documentGroupId,
            String title,
            String modelId,
            Instant createdAt,
            Instant lastMessageAt,
            String lastMessagePreview,
            long messageCount
        ) {
            this(threadId, documentGroupId, title, modelId, createdAt, null, null, lastMessageAt, lastMessagePreview, messageCount);
        }
    }

    record ChatThreadListPagination(
        int limit,
        String nextCursor,
        boolean hasMore
    ) {
    }
}
