package com.brainx.workspace.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "workspace_notes", indexes = @Index(name = "idx_notes_user_updated", columnList = "userId,updatedAt"))
public class Note {
    @Id
    private String noteId;
    @Column(nullable = false)
    private String userId;
    private String documentGroupId;
    @Column(nullable = false)
    private String title;
    @Column(columnDefinition = "text", nullable = false)
    private String markdown;
    private String folderId;
    @Column(columnDefinition = "text")
    private String typographyJson;
    @ElementCollection
    @CollectionTable(name = "workspace_note_tags", joinColumns = @JoinColumn(name = "note_id"))
    @Column(name = "tag_name")
    private List<String> tags = new ArrayList<>();
    @Column(nullable = false)
    private int version;
    @Column(nullable = false)
    private boolean archived;
    @Column(nullable = false)
    private boolean deleted;
    private Instant deletedAt;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;
    private Instant lastViewedAt;

    public Note(String noteId, String userId, String title, String markdown, String folderId, List<String> tags, Instant now) {
        this(noteId, userId, null, title, markdown, folderId, tags, now);
    }

    public Note(String noteId, String userId, String documentGroupId, String title, String markdown, String folderId, List<String> tags, Instant now) {
        this.noteId = noteId;
        this.userId = userId;
        this.documentGroupId = documentGroupId;
        this.title = title;
        this.markdown = markdown == null ? "" : markdown;
        this.folderId = folderId;
        this.tags = sanitizeTags(tags);
        this.version = 1;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void saveContent(String markdown, Instant now) {
        this.markdown = markdown == null ? "" : markdown;
        this.version++;
        this.updatedAt = now;
    }

    public void applyDraft(String title, String markdown, String folderId, Instant now) {
        if (title != null && !title.isBlank()) {
            this.title = title;
        }
        this.markdown = markdown == null ? "" : markdown;
        // draft가 마지막으로 들고 있던 폴더 배치를 그대로 반영한다(guest -> user 승계, idle flush
        // 모두 이 경로를 타므로 폴더 구조가 그대로 유지된다) — folderId가 빈 문자열이면 루트로
        // 이동(FolderPatchRequest/handleMoveFolderToParent와 동일한 규칙), null이면 변경 없음이
        // 아니라 "루트"로 취급한다(draft는 항상 현재 폴더 배치 전체를 보내므로 부분 patch가 아님).
        this.folderId = (folderId == null || folderId.isBlank()) ? null : folderId;
        this.version++;
        this.updatedAt = now;
    }

    public void patchMetadata(String title, String folderId, List<String> tags, Boolean archived, String typographyJson, Instant now) {
        if (title != null && !title.isBlank()) {
            this.title = title;
        }
        if (folderId != null) {
            this.folderId = folderId.isBlank() ? null : folderId;
        }
        if (tags != null) {
            this.tags = sanitizeTags(tags);
        }
        if (archived != null) {
            this.archived = archived;
        }
        if (typographyJson != null) {
            this.typographyJson = typographyJson.isBlank() ? null : typographyJson;
        }
        this.version++;
        this.updatedAt = now;
    }

    public void replaceTags(List<String> tags, Instant now) {
        this.tags = sanitizeTags(tags);
        this.version++;
        this.updatedAt = now;
    }

    public void moveToFolder(String folderId, Instant now) {
        this.folderId = folderId;
        this.version++;
        this.updatedAt = now;
    }

    public void trash(Instant now) {
        this.deleted = true;
        this.deletedAt = now;
        this.updatedAt = now;
    }

    public void recordView(Instant viewedAt) {
        this.lastViewedAt = viewedAt;
    }

    private static List<String> sanitizeTags(List<String> tags) {
        if (tags == null) {
            return new ArrayList<>();
        }
        return tags.stream()
                .filter(tag -> tag != null && !tag.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }
}
