package com.brainx.workspace.repository;

import com.brainx.workspace.entity.NoteTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface NoteTagRepository extends JpaRepository<NoteTag, String> {
    void deleteByNoteNoteId(String noteId);
}
