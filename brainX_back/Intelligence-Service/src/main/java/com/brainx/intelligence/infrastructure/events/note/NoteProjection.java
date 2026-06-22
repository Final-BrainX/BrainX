package com.brainx.intelligence.infrastructure.events.note;

import java.time.Instant;
import java.util.List;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record NoteProjection(
    String userId,
    String documentGroupId,
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
    Instant updatedAt,
    NoteSearchIndexStatus searchIndexStatus,
    Integer indexedVersion,
    String indexedMarkdownHash,
    Instant indexedAt
) {

    public NoteProjection {
        userId = requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        noteId = requireText(noteId, "noteId");
        title = title == null ? "" : title;
        tags = tags == null ? List.of() : tags.stream()
            .filter(value -> value != null && !value.isBlank())
            .distinct()
            .toList();
        updatedAt = updatedAt == null ? Instant.EPOCH : updatedAt;
        searchIndexStatus = searchIndexStatus == null
            ? defaultSearchIndexStatus(archived, trashed, deleted)
            : searchIndexStatus;
        if (indexedVersion != null && indexedVersion < 0) {
            throw new IllegalArgumentException("indexedVersion must not be negative.");
        }
        if (searchIndexStatus == NoteSearchIndexStatus.NOT_INDEXED
            || searchIndexStatus == NoteSearchIndexStatus.REMOVED) {
            indexedVersion = null;
            indexedMarkdownHash = null;
            indexedAt = null;
        }
    }

    public NoteProjection(
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
        this(
            userId,
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
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
            updatedAt
        );
    }

    public NoteProjection(
        String userId,
        String documentGroupId,
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
        this(
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
            defaultSearchIndexStatus(archived, trashed, deleted),
            null,
            null,
            null
        );
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
        return created(
            userId,
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            noteId,
            title,
            folderId,
            tags,
            version,
            eventId,
            updatedAt
        );
    }

    public static NoteProjection created(
        String userId,
        String documentGroupId,
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
            documentGroupId,
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

    public boolean indexedFor(int targetVersion, String targetMarkdownHash) {
        return searchIndexStatus == NoteSearchIndexStatus.INDEXED
            && indexedVersion != null
            && indexedVersion == targetVersion
            && sameValue(indexedMarkdownHash, targetMarkdownHash);
    }

    public NoteProjection withDocumentGroupId(String documentGroupId) {
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
            documentGroupId,
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
            updatedAt,
            targetStatus(version, markdownHash, archived, trashed, deleted),
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
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
        boolean nextArchived = archived == null ? this.archived : archived;
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title == null ? this.title : title,
            folderId == null ? this.folderId : folderId,
            tags == null ? this.tags : tags,
            version,
            markdownHash,
            contentPending,
            nextArchived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection withTags(List<String> tags, String eventId, Instant updatedAt) {
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
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection movedTo(String folderId, String eventId, Instant updatedAt) {
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
            eventId,
            updatedAt,
            searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection trashed(String eventId, Instant updatedAt) {
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
            true,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection deleted(String eventId, Instant updatedAt) {
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
            true,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection indexed(int version, String markdownHash, Instant indexedAt) {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            this.version,
            this.markdownHash,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            NoteSearchIndexStatus.INDEXED,
            version,
            markdownHash,
            indexedAt
        );
    }

    public NoteProjection provisionallyIndexed(int version, Instant indexedAt) {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            this.version,
            markdownHash,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            NoteSearchIndexStatus.PROVISIONAL,
            version,
            null,
            indexedAt
        );
    }

    public NoteProjection indexFailed(String eventId, Instant updatedAt) {
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
            eventId,
            updatedAt,
            NoteSearchIndexStatus.FAILED,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt
        );
    }

    public NoteProjection indexRemoved(String eventId, Instant updatedAt) {
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
            eventId,
            updatedAt,
            NoteSearchIndexStatus.REMOVED,
            null,
            null,
            null
        );
    }

    private NoteSearchIndexStatus targetStatus(
        int version,
        String markdownHash,
        boolean archived,
        boolean trashed,
        boolean deleted
    ) {
        if (archived || trashed || deleted) {
            return NoteSearchIndexStatus.STALE;
        }
        return indexedFor(version, markdownHash) ? NoteSearchIndexStatus.INDEXED : NoteSearchIndexStatus.STALE;
    }

    private static NoteSearchIndexStatus defaultSearchIndexStatus(boolean archived, boolean trashed, boolean deleted) {
        return archived || trashed || deleted ? NoteSearchIndexStatus.REMOVED : NoteSearchIndexStatus.NOT_INDEXED;
    }

    private static boolean sameValue(String left, String right) {
        if (left == null) {
            return right == null;
        }
        return left.equals(right);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value;
    }
}
