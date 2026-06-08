package com.brainx.workspace.repository;

import com.brainx.workspace.entity.NoteLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NoteLinkRepository extends JpaRepository<NoteLink, String> {
    List<NoteLink> findBySourceNoteNoteId(String sourceNoteId);
    List<NoteLink> findByTargetNoteNoteId(String targetNoteId);
    boolean existsBySourceNoteNoteIdAndTargetNoteNoteId(String sourceNoteId, String targetNoteId);
}
