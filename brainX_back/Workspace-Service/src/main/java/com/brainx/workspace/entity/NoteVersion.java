package com.brainx.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "workspace_note_versions")
public class NoteVersion {
    @Id
    private String versionId;
    @Column(nullable = false)
    private String noteId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private int version;
    @Column(nullable = false)
    private String title;
    @Column(columnDefinition = "text", nullable = false)
    private String markdown;
    @Column(nullable = false)
    private Instant savedAt;

    public NoteVersion(String versionId, Note note, Instant savedAt) {
        this.versionId = versionId;
        this.noteId = note.getNoteId();
        this.userId = note.getUserId();
        this.version = note.getVersion();
        this.title = note.getTitle();
        this.markdown = note.getMarkdown();
        this.savedAt = savedAt;
    }
}
