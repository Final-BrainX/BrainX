package com.brainx.workspace.repository;

import com.brainx.workspace.entity.NoteVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteVersionRepository extends JpaRepository<NoteVersion, String> {
    List<NoteVersion> findByNoteIdAndUserIdOrderByVersionDesc(String noteId, String userId);
    Optional<NoteVersion> findByVersionIdAndNoteIdAndUserId(String versionId, String noteId, String userId);
}
