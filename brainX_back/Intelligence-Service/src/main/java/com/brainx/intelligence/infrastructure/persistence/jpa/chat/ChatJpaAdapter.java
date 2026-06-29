package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort.ChatThreadSummaryCursor;
import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatThreadSummary;

@Repository
public class ChatJpaAdapter implements ChatPersistencePort {

    private final ChatThreadJpaRepository chatThreadJpaRepository;
    private final ChatMessageJpaRepository chatMessageJpaRepository;

    public ChatJpaAdapter(
        ChatThreadJpaRepository chatThreadJpaRepository,
        ChatMessageJpaRepository chatMessageJpaRepository
    ) {
        this.chatThreadJpaRepository = chatThreadJpaRepository;
        this.chatMessageJpaRepository = chatMessageJpaRepository;
    }

    @Override
    @Transactional
    public ChatThread saveThread(ChatThread thread) {
        return chatThreadJpaRepository.save(ChatThreadJpaEntity.fromDomain(thread))
            .toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ChatThread> findThreadByUserIdAndThreadId(String userId, String threadId) {
        return chatThreadJpaRepository.findByUserIdAndThreadId(userId, threadId)
            .map(ChatThreadJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatThreadSummary> findThreadSummariesByUserId(
        String userId,
        ChatThreadSummaryCursor cursor,
        int limit
    ) {
        return chatThreadJpaRepository.findThreadSummariesByUserId(
                userId,
                cursor == null ? null : cursor.lastMessageAt(),
                cursor == null ? "" : cursor.threadId(),
                limit
            ).stream()
            .map(projection -> new ChatThreadSummary(
                projection.getThreadId(),
                projection.getUserId(),
                projection.getDocumentGroupId(),
                projection.getTitle(),
                projection.getModelId(),
                instantValue(projection.getCreatedAt()),
                instantValue(projection.getLastMessageAt()),
                latestMessagePreview(userId, projection.getThreadId()),
                longValue(projection.getMessageCount())
            ))
            .toList();
    }

    @Override
    @Transactional
    public ChatMessage saveMessage(ChatMessage message) {
        return chatMessageJpaRepository.save(ChatMessageJpaEntity.fromDomain(message))
            .toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatMessage> findMessagesByUserIdAndThreadId(String userId, String threadId) {
        return chatMessageJpaRepository.findByUserIdAndThreadIdOrderByCreatedAtAsc(userId, threadId).stream()
            .map(ChatMessageJpaEntity::toDomain)
            .toList();
    }

    private String latestMessagePreview(String userId, String threadId) {
        return chatMessageJpaRepository
            .findFirstByUserIdAndThreadIdOrderByCreatedAtDescMessageIdDesc(userId, threadId)
            .map(ChatMessageJpaEntity::content)
            .orElse(null);
    }

    private static Instant instantValue(Object value) {
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof OffsetDateTime offsetDateTime) {
            return offsetDateTime.toInstant();
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof LocalDateTime localDateTime) {
            return localDateTime.toInstant(ZoneOffset.UTC);
        }
        if (value != null) {
            return Instant.parse(value.toString());
        }
        return Instant.EPOCH;
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value != null) {
            return Long.parseLong(value.toString());
        }
        return 0L;
    }

}
