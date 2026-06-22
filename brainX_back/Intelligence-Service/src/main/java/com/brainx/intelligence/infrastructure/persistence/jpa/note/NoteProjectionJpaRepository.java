package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
