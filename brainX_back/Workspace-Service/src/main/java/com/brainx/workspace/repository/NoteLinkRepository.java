package com.brainx.workspace.repository;

import com.brainx.workspace.entity.NoteLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteLinkRepository extends JpaRepository<NoteLink, String> {
    List<NoteLink> findByUserId(String userId);
    List<NoteLink> findBySourceNoteIdAndUserId(String sourceNoteId, String userId);
    List<NoteLink> findByTargetNoteIdAndUserId(String targetNoteId, String userId);
    Optional<NoteLink> findByLinkIdAndSourceNoteIdAndUserId(String linkId, String sourceNoteId, String userId);
}
