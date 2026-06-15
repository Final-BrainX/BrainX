package com.brainx.workspace.repository;

import com.brainx.workspace.entity.NoteContent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface NoteContentRepository extends JpaRepository<NoteContent, String> {
}
