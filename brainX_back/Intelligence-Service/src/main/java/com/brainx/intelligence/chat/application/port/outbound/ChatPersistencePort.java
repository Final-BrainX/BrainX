package com.brainx.intelligence.chat.application.port.outbound;

import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatThreadSummary;

public interface ChatPersistencePort {

    ChatThread saveThread(ChatThread thread);

    Optional<ChatThread> findThreadByUserIdAndThreadId(String userId, String threadId);

    List<ChatThreadSummary> findThreadSummariesByUserId(
        String userId,
        ChatThreadSummaryCursor cursor,
        int limit
    );

    ChatMessage saveMessage(ChatMessage message);

    List<ChatMessage> findMessagesByUserIdAndThreadId(String userId, String threadId);

    record ChatThreadSummaryCursor(
        java.time.Instant lastMessageAt,
        String threadId
    ) {
    }
}
