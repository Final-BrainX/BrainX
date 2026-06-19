package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;

@Repository
public class NoteProjectionJpaAdapter implements NoteProjectionStore {

    private final NoteProjectionJpaRepository repository;

    public NoteProjectionJpaAdapter(NoteProjectionJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<NoteProjection> findByUserIdAndNoteId(String userId, String noteId) {
        return repository.findByUserIdAndNoteId(userId, noteId)
            .map(NoteProjectionJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NoteProjection> findByUserIdAndNoteIds(String userId, List<String> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }
        return repository.findByUserIdAndNoteIdIn(userId, noteIds).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public NoteProjection save(NoteProjection projection) {
        return repository.save(NoteProjectionJpaEntity.fromDomain(projection)).toDomain();
    }
}
