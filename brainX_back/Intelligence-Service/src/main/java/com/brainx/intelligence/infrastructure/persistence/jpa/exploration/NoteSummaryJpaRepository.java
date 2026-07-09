package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface NoteSummaryJpaRepository extends JpaRepository<NoteSummaryJpaEntity, String> {

    @Query("""
        select s from NoteSummaryJpaEntity s
        where s.userId = :userId and s.noteId = :noteId
        order by case when s.generatedAt is null then 1 else 0 end,
            s.generatedAt desc,
            s.summaryId desc
        """)
    List<NoteSummaryJpaEntity> findLatestByUserIdAndNoteId(
        @Param("userId") String userId,
        @Param("noteId") String noteId,
        Pageable pageable
    );

    Optional<NoteSummaryJpaEntity> findFirstByUserIdAndDocumentGroupIdAndNoteIdOrderByGeneratedAtDesc(
        String userId,
        String documentGroupId,
        String noteId
    );

    Optional<NoteSummaryJpaEntity> findFirstByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHashOrderByGeneratedAtDesc(
        String userId,
        String documentGroupId,
        String noteId,
        String markdownHash
    );

    void deleteByUserIdAndNoteId(String userId, String noteId);
}
