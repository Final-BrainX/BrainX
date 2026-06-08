package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Note;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface NoteRepository extends JpaRepository<Note, String> {

    List<Note> findByUserIdAndStatusNot(String userId, Note.NoteStatus status);

    Optional<Note> findByNoteIdAndUserId(String noteId, String userId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.content LEFT JOIN FETCH n.noteTags nt LEFT JOIN FETCH nt.tag WHERE n.noteId = :noteId AND n.userId = :userId")
    Optional<Note> findByNoteIdAndUserIdWithDetails(String noteId, String userId);

    @Query("SELECT n FROM Note n WHERE n.userId = :userId AND n.updatedAt > :since AND n.status != 'DELETED'")
    List<Note> findUpdatedSince(@Param("userId") String userId, @Param("since") LocalDateTime since);

    List<Note> findByUserIdAndStatus(String userId, Note.NoteStatus status);
}
