package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.lang.Nullable;

interface ChatThreadJpaRepository extends JpaRepository<ChatThreadJpaEntity, String> {

    Optional<ChatThreadJpaEntity> findByUserIdAndThreadIdAndDeletedAtIsNull(String userId, String threadId);

    @Query(value = """
        select
          s.thread_id as threadId,
          s.user_id as userId,
          s.document_group_id as documentGroupId,
          s.title as title,
          s.model_id as modelId,
          s.created_at as createdAt,
          s.archived_at as archivedAt,
          s.deleted_at as deletedAt,
          s.last_message_at as lastMessageAt,
          s.message_count as messageCount
        from (
          select
            t.thread_id,
            t.user_id,
            t.document_group_id,
            t.title,
            t.model_id,
            t.created_at,
            t.archived_at,
            t.deleted_at,
            coalesce(max(m.created_at), t.created_at) as last_message_at,
            count(m.message_id) as message_count
          from intelligence_chat_threads t
          left join intelligence_chat_messages m
            on m.user_id = t.user_id
           and m.thread_id = t.thread_id
          where t.user_id = :userId
            and t.deleted_at is null
            and (
              (:status = 'ACTIVE' and t.archived_at is null)
              or (:status = 'ARCHIVED' and t.archived_at is not null)
            )
          group by
            t.thread_id,
            t.user_id,
            t.document_group_id,
            t.title,
            t.model_id,
            t.created_at,
            t.archived_at,
            t.deleted_at
        ) s
        where (cast(:cursorAt as timestamp with time zone) is null
          or s.last_message_at < cast(:cursorAt as timestamp with time zone)
          or (s.last_message_at = cast(:cursorAt as timestamp with time zone) and s.thread_id < :cursorThreadId))
        order by s.last_message_at desc, s.thread_id desc
        limit :limit
        """, nativeQuery = true)
    List<ChatThreadSummaryProjection> findThreadSummariesByUserId(
        @Param("userId") String userId,
        @Param("status") String status,
        @Param("cursorAt") @Nullable Instant cursorAt,
        @Param("cursorThreadId") @Nullable String cursorThreadId,
        @Param("limit") int limit
    );

    interface ChatThreadSummaryProjection {

        String getThreadId();

        String getUserId();

        String getDocumentGroupId();

        String getTitle();

        String getModelId();

        Object getCreatedAt();

        @Nullable
        Object getArchivedAt();

        @Nullable
        Object getDeletedAt();

        Object getLastMessageAt();

        Object getMessageCount();
    }
}
