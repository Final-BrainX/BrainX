package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ChatMessageJpaRepository extends JpaRepository<ChatMessageJpaEntity, String> {

    List<ChatMessageJpaEntity> findByUserIdAndThreadIdOrderByCreatedAtAsc(String userId, String threadId);

    Optional<ChatMessageJpaEntity> findByUserIdAndThreadIdAndMessageId(String userId, String threadId, String messageId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select message
        from ChatMessageJpaEntity message
        where message.userId = :userId
          and message.threadId = :threadId
          and message.messageId = :messageId
        """)
    Optional<ChatMessageJpaEntity> findByUserIdAndThreadIdAndMessageIdForUpdate(
        @Param("userId") String userId,
        @Param("threadId") String threadId,
        @Param("messageId") String messageId
    );

    Optional<ChatMessageJpaEntity> findFirstByUserIdAndThreadIdOrderByCreatedAtDescMessageIdDesc(
        String userId,
        String threadId
    );
}
