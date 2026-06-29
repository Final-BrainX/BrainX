package com.brainx.intelligence.chat.application.port.inbound;

import java.time.Instant;
import java.util.List;

public interface ListChatThreadsUseCase {

    ChatThreadListResult listChatThreads(ListChatThreadsQuery query);

    record ListChatThreadsQuery(
        String userId,
        Integer limit,
        String cursor
    ) {
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
        Instant lastMessageAt,
        String lastMessagePreview,
        long messageCount
    ) {
    }

    record ChatThreadListPagination(
        int limit,
        String nextCursor,
        boolean hasMore
    ) {
    }
}
