package com.brainx.intelligence.infrastructure.events.note;

import java.time.Instant;
import java.util.List;

public record NoteProjection(
    String userId,
    String noteId,
    String title,
    String folderId,
    List<String> tags,
    int version,
    String markdownHash,
    boolean contentPending,
    boolean archived,
    boolean trashed,
    boolean deleted,
    String lastEventId,
    Instant updatedAt
) {

    public NoteProjection {
        userId = requireText(userId, "userId");
        noteId = requireText(noteId, "noteId");
        title = title == null ? "" : title;
        tags = tags == null ? List.of() : tags.stream()
            .filter(value -> value != null && !value.isBlank())
            .distinct()
            .toList();
        updatedAt = updatedAt == null ? Instant.EPOCH : updatedAt;
    }

    public static NoteProjection created(
        String userId,
        String noteId,
        String title,
        String folderId,
        List<String> tags,
        int version,
        String eventId,
        Instant updatedAt
    ) {
        return new NoteProjection(
            userId,
            noteId,
            title,
            folderId,
            tags,
            version,
            null,
            true,
            false,
            false,
            false,
            eventId,
            updatedAt
        );
    }

    public boolean stale(int incomingVersion) {
        return incomingVersion < version;
    }

    public boolean searchable() {
        return !archived && !trashed && !deleted;
    }

    public boolean sameContent(int incomingVersion, String incomingMarkdownHash) {
        return version == incomingVersion
            && markdownHash != null
            && markdownHash.equals(incomingMarkdownHash);
    }

    public NoteProjection withSnapshot(
        String title,
        String folderId,
        List<String> tags,
        int version,
        String markdownHash,
        String eventId,
        Instant updatedAt
    ) {
        return new NoteProjection(
            userId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            false,
            archived,
            trashed,
            deleted,
            eventId,
            updatedAt
        );
    }

    public NoteProjection withMetadata(
        String title,
        String folderId,
        List<String> tags,
        Boolean archived,
        int version,
        String eventId,
        Instant updatedAt
    ) {
        return new NoteProjection(
            userId,
            noteId,
            title == null ? this.title : title,
            folderId == null ? this.folderId : folderId,
            tags == null ? this.tags : tags,
            version,
            markdownHash,
            contentPending,
            archived == null ? this.archived : archived,
            trashed,
            deleted,
            eventId,
            updatedAt
        );
    }

    public NoteProjection withTags(List<String> tags, String eventId, Instant updatedAt) {
        return new NoteProjection(
            userId,
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
            eventId,
            updatedAt
        );
    }

    public NoteProjection movedTo(String folderId, String eventId, Instant updatedAt) {
        return new NoteProjection(
            userId,
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
            eventId,
            updatedAt
        );
    }

    public NoteProjection trashed(String eventId, Instant updatedAt) {
        return new NoteProjection(
            userId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            contentPending,
            archived,
            true,
            deleted,
            eventId,
            updatedAt
        );
    }

    public NoteProjection deleted(String eventId, Instant updatedAt) {
        return new NoteProjection(
            userId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            contentPending,
            archived,
            trashed,
            true,
            eventId,
            updatedAt
        );
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value;
    }
}
