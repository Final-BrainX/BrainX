package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import java.time.Instant;
import java.util.List;

import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteSearchIndexStatus;
import com.brainx.intelligence.infrastructure.persistence.jpa.JsonStringListAttributeConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_note_projections")
public class NoteProjectionJpaEntity {

    @Id
    @Column(name = "projection_id", nullable = false, length = 240)
    private String projectionId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "document_group_id", nullable = false, length = 120)
    private String documentGroupId;

    @Column(name = "note_id", nullable = false, length = 120)
    private String noteId;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    @Column(name = "folder_id", length = 120)
    private String folderId;

    @Lob
    @Convert(converter = JsonStringListAttributeConverter.class)
    @Column(name = "tags", nullable = false)
    private List<String> tags;

    @Column(name = "note_version", nullable = false)
    private int version;

    @Column(name = "markdown_hash", length = 160)
    private String markdownHash;

    @Column(name = "content_pending", nullable = false)
    private boolean contentPending;

    @Column(name = "archived", nullable = false)
    private boolean archived;

    @Column(name = "trashed", nullable = false)
    private boolean trashed;

    @Column(name = "deleted", nullable = false)
    private boolean deleted;

    @Column(name = "last_event_id", length = 160)
    private String lastEventId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "search_index_status", length = 40)
    private NoteSearchIndexStatus searchIndexStatus;

    @Column(name = "indexed_version")
    private Integer indexedVersion;

    @Column(name = "indexed_markdown_hash", length = 160)
    private String indexedMarkdownHash;

    @Column(name = "indexed_at")
    private Instant indexedAt;

    protected NoteProjectionJpaEntity() {
    }

    static NoteProjectionJpaEntity fromDomain(NoteProjection projection) {
        NoteProjectionJpaEntity entity = new NoteProjectionJpaEntity();
        entity.projectionId = projection.userId() + "::" + projection.documentGroupId() + "::" + projection.noteId();
        entity.userId = projection.userId();
        entity.documentGroupId = projection.documentGroupId();
        entity.noteId = projection.noteId();
        entity.title = projection.title();
        entity.folderId = projection.folderId();
        entity.tags = projection.tags();
        entity.version = projection.version();
        entity.markdownHash = projection.markdownHash();
        entity.contentPending = projection.contentPending();
        entity.archived = projection.archived();
        entity.trashed = projection.trashed();
        entity.deleted = projection.deleted();
        entity.lastEventId = projection.lastEventId();
        entity.updatedAt = projection.updatedAt();
        entity.searchIndexStatus = projection.searchIndexStatus();
        entity.indexedVersion = projection.indexedVersion();
        entity.indexedMarkdownHash = projection.indexedMarkdownHash();
        entity.indexedAt = projection.indexedAt();
        return entity;
    }

    String projectionId() {
        return projectionId;
    }

    void setProjectionId(String projectionId) {
        this.projectionId = projectionId;
    }

    NoteProjection toDomain() {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }
}
