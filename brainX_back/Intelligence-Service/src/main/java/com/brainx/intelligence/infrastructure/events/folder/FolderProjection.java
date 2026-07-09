package com.brainx.intelligence.infrastructure.events.folder;

import java.time.Instant;

public record FolderProjection(
    String folderId,
    String userId,
    String name,
    String parentFolderId,
    Integer order,
    boolean deleted,
    String childNoteAction,
    String targetFolderId,
    String lastEventId,
    Instant updatedAt
) {

    public FolderProjection {
        folderId = requireText(folderId, "folderId");
        userId = requireText(userId, "userId");
        name = normalizeOptionalText(name);
        parentFolderId = normalizeOptionalText(parentFolderId);
        childNoteAction = normalizeOptionalText(childNoteAction);
        targetFolderId = normalizeOptionalText(targetFolderId);
        lastEventId = requireText(lastEventId, "lastEventId");
        updatedAt = updatedAt == null ? Instant.EPOCH : updatedAt;
    }

    public static FolderProjection created(
        String folderId,
        String userId,
        String name,
        String parentFolderId,
        String eventId,
        Instant updatedAt
    ) {
        return new FolderProjection(folderId, userId, requireText(name, "name"), parentFolderId, null, false, null, null, eventId, updatedAt);
    }

    public FolderProjection withChanges(
        String name,
        String parentFolderId,
        Integer order,
        String eventId,
        Instant updatedAt
    ) {
        return new FolderProjection(
            folderId,
            userId,
            name,
            parentFolderId,
            order,
            deleted,
            childNoteAction,
            targetFolderId,
            eventId,
            updatedAt
        );
    }

    public FolderProjection deleted(String childNoteAction, String targetFolderId, String eventId, Instant updatedAt) {
        return new FolderProjection(folderId, userId, name, parentFolderId, order, true, childNoteAction, targetFolderId, eventId, updatedAt);
    }

    public boolean sameFolder(String name, String parentFolderId, Integer order, boolean deleted, String childNoteAction, String targetFolderId) {
        return sameValue(this.name, normalizeOptionalText(name))
            && sameValue(this.parentFolderId, normalizeOptionalText(parentFolderId))
            && sameValue(this.order, order)
            && this.deleted == deleted
            && sameValue(this.childNoteAction, normalizeOptionalText(childNoteAction))
            && sameValue(this.targetFolderId, normalizeOptionalText(targetFolderId));
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static boolean sameValue(Object left, Object right) {
        if (left == null) {
            return right == null;
        }
        return left.equals(right);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value.trim();
    }
}
