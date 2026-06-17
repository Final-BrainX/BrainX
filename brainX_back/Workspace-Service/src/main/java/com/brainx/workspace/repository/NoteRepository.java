package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Note;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, String> {
    Optional<Note> findByNoteIdAndUserId(String noteId, String userId);
    List<Note> findByUserIdOrderByUpdatedAtDesc(String userId);
    List<Note> findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(String userId);
    List<Note> findByUserIdAndFolderIdAndDeletedFalse(String userId, String folderId);
    Optional<Note> findFirstByUserIdAndTitleAndDeletedFalse(String userId, String title);
}
