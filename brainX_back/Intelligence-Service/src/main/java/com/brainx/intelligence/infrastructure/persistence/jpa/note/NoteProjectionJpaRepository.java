package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.brainx.intelligence.infrastructure.events.note.NoteSearchIndexStatus;

interface NoteProjectionJpaRepository extends JpaRepository<NoteProjectionJpaEntity, String> {

    Optional<NoteProjectionJpaEntity> findByUserIdAndDocumentGroupIdAndNoteId(
        String userId,
        String documentGroupId,
        String noteId
    );

    List<NoteProjectionJpaEntity> findByUserIdAndDocumentGroupIdAndNoteIdIn(
        String userId,
        String documentGroupId,
        Collection<String> noteIds
    );

    @Query("""
        select projection
        from NoteProjectionJpaEntity projection
        where projection.userId = :userId
          and projection.documentGroupId = :documentGroupId
          and projection.archived = false
          and projection.trashed = false
          and projection.deleted = false
          and projection.contentPending = false
          and projection.markdown is not null
          and projection.searchIndexStatus = :status
        order by projection.updatedAt desc, projection.noteId asc
        """)
    List<NoteProjectionJpaEntity> findSearchable(
        @Param("userId") String userId,
        @Param("documentGroupId") String documentGroupId,
        @Param("status") NoteSearchIndexStatus status,
        Pageable pageable
    );

    @Query("""
        select projection
        from NoteProjectionJpaEntity projection
        where projection.userId = :userId
          and projection.documentGroupId = :documentGroupId
          and projection.folderId = :folderId
          and projection.archived = false
          and projection.trashed = false
          and projection.deleted = false
          and projection.contentPending = false
          and projection.markdown is not null
          and projection.searchIndexStatus = :status
        order by projection.updatedAt desc, projection.noteId asc
        """)
    List<NoteProjectionJpaEntity> findSearchableByFolder(
        @Param("userId") String userId,
        @Param("documentGroupId") String documentGroupId,
        @Param("folderId") String folderId,
        @Param("status") NoteSearchIndexStatus status,
        Pageable pageable
    );

    @Query(value = """
        select *
        from intelligence_note_projections projection
        where projection.user_id = :userId
          and (:documentGroupId is null or projection.document_group_id = :documentGroupId)
          and projection.archived = false
          and projection.trashed = false
          and projection.deleted = false
          and projection.content_pending = false
          and projection.markdown is not null
          and projection.search_index_status = :status
          and (
            lower(projection.title) like :pattern
            or lower(cast(projection.markdown as varchar)) like :pattern
            or lower(cast(projection.tags as varchar)) like :pattern
          )
        order by projection.updated_at desc, projection.note_id asc
        """, nativeQuery = true)
    List<NoteProjectionJpaEntity> findKeywordSearchable(
        @Param("userId") String userId,
        @Param("documentGroupId") String documentGroupId,
        @Param("status") String status,
        @Param("pattern") String pattern,
        Pageable pageable
    );

    @Query("""
        select projection
        from NoteProjectionJpaEntity projection
        where projection.archived = false
          and projection.trashed = false
          and projection.deleted = false
          and (
            projection.searchIndexStatus in :statuses
            or projection.contentPending = true
          )
          and (
            projection.nextIndexRetryAt is null
            or projection.nextIndexRetryAt <= :now
          )
        order by
          case when projection.nextIndexRetryAt is null then 0 else 1 end asc,
          projection.nextIndexRetryAt asc,
          projection.updatedAt desc,
          projection.noteId asc
        """)
    List<NoteProjectionJpaEntity> findRetryCandidates(
        @Param("statuses") Collection<NoteSearchIndexStatus> statuses,
        @Param("now") Instant now,
        Pageable pageable
    );
}
