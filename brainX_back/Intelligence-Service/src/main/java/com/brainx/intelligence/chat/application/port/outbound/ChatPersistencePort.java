package com.brainx.intelligence.chat.application.port.outbound;

import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatThreadSummary;
import com.brainx.intelligence.chat.domain.ChatThreadStatus;

public interface ChatPersistencePort {

    ChatThread saveThread(ChatThread thread);

    Optional<ChatThread> findThreadByUserIdAndThreadId(String userId, String threadId);

    List<ChatThreadSummary> findThreadSummariesByUserId(
        String userId,
        ChatThreadStatus status,
        ChatThreadSummaryCursor cursor,
        int limit
    );

    Optional<ChatThread> archiveThread(String userId, String threadId, java.time.Instant archivedAt);

    Optional<ChatThread> unarchiveThread(String userId, String threadId);

    Optional<ChatThread> deleteThread(String userId, String threadId, java.time.Instant deletedAt);

    ChatMessage saveMessage(ChatMessage message);

    Optional<ChatMessage> findMessageByUserIdAndThreadIdAndMessageId(String userId, String threadId, String messageId);

    Optional<ChatMessage> recordSavedDraftNoteId(String userId, String threadId, String messageId, String noteId);

    List<ChatMessage> findMessagesByUserIdAndThreadId(String userId, String threadId);

    record ChatThreadSummaryCursor(
        java.time.Instant lastMessageAt,
        String threadId
    ) {
    }
}
