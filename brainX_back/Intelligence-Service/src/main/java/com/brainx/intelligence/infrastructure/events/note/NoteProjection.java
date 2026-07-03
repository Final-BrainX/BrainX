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
    String markdown,
    boolean contentPending,
    boolean archived,
    boolean trashed,
    boolean deleted,
    String lastEventId,
    Instant updatedAt,
    NoteSearchIndexStatus searchIndexStatus,
    Integer indexedVersion,
    String indexedMarkdownHash,
    Instant indexedAt,
    Instant lastIndexAttemptAt,
    Instant nextIndexRetryAt,
    int indexAttemptCount,
    String lastIndexErrorCode,
    String lastIndexErrorMessage
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
        if (indexAttemptCount < 0) {
            indexAttemptCount = 0;
        }
        lastIndexErrorCode = normalizeError(lastIndexErrorCode, 120);
        lastIndexErrorMessage = normalizeError(lastIndexErrorMessage, 1000);
        markdown = normalizeMarkdown(markdown);
        if (archived || trashed || deleted || searchIndexStatus == NoteSearchIndexStatus.REMOVED) {
            markdown = null;
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
        String documentGroupId,
        String noteId,
        String title,
        String folderId,
        List<String> tags,
        int version,
        String markdownHash,
        String markdown,
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
        this(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            null,
            null,
            0,
            null,
            null
        );
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
            null,
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
            null,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            defaultSearchIndexStatus(archived, trashed, deleted),
            null,
            null,
            null,
            null,
            null,
            0,
            null,
            null
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
        String markdown,
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            defaultSearchIndexStatus(archived, trashed, deleted),
            null,
            null,
            null,
            null,
            null,
            0,
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
        );
    }

    public NoteProjection withSnapshot(
        String title,
        String folderId,
        List<String> tags,
        int version,
        String markdownHash,
        String markdown,
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
            markdown,
            false,
            archived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            targetStatus(version, markdownHash, archived, trashed, deleted),
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            markdown,
            contentPending,
            nextArchived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            null,
            contentPending,
            archived,
            true,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            null,
            contentPending,
            archived,
            trashed,
            true,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.STALE,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            NoteSearchIndexStatus.INDEXED,
            version,
            markdownHash,
            indexedAt,
            null,
            null,
            0,
            null,
            null
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            NoteSearchIndexStatus.PROVISIONAL,
            version,
            null,
            indexedAt,
            null,
            null,
            0,
            null,
            null
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.FAILED,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextIndexRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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
            null,
            contentPending,
            archived,
            trashed,
            deleted,
            eventId,
            updatedAt,
            NoteSearchIndexStatus.REMOVED,
            null,
            null,
            null,
            null,
            null,
            0,
            null,
            null
        );
    }

    public NoteProjection withIndexRetryFailure(
        String eventId,
        Instant attemptAt,
        Instant nextRetryAt,
        String errorCode,
        String errorMessage,
        boolean markFailed
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
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            eventId == null || eventId.isBlank() ? lastEventId : eventId,
            attemptAt == null ? updatedAt : attemptAt,
            markFailed ? NoteSearchIndexStatus.FAILED : searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            attemptAt,
            nextRetryAt,
            indexAttemptCount + 1,
            errorCode,
            errorMessage
        );
    }

    public NoteProjection deferIndexRetry(Instant nextRetryAt) {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            lastEventId,
            updatedAt,
            searchIndexStatus,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            lastIndexAttemptAt,
            nextRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
        );
    }

    public NoteProjection withIndexRetryExhausted(String eventId, Instant attemptAt, Instant nextRetryAt) {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            title,
            folderId,
            tags,
            version,
            markdownHash,
            markdown,
            contentPending,
            archived,
            trashed,
            deleted,
            eventId == null || eventId.isBlank() ? lastEventId : eventId,
            attemptAt == null ? updatedAt : attemptAt,
            NoteSearchIndexStatus.FAILED,
            indexedVersion,
            indexedMarkdownHash,
            indexedAt,
            attemptAt,
            nextRetryAt,
            indexAttemptCount,
            lastIndexErrorCode,
            lastIndexErrorMessage
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

    private static String normalizeMarkdown(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    private static String normalizeError(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value;
    }
}
