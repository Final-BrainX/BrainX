package com.brainx.workspace.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class WorkspaceDtos {
    private WorkspaceDtos() {
    }

    public record WorkspaceSyncData(String cursor, List<Map<String, Object>> notes, List<Map<String, Object>> folders,
                                    List<Map<String, Object>> tags, List<Map<String, Object>> links,
                                    List<Map<String, Object>> favorites,
                                    List<Map<String, Object>> recentActivities) {
    }

    public record NoteListData(List<Map<String, Object>> notes, int totalCount) {
    }

    public record NoteCreateRequest(@NotBlank String title, String markdown, String folderId, List<String> tags) {
    }

    public record NoteCreatedData(String noteId, String title, String folderId, int version, Instant createdAt) {
    }

    public record NoteDetailData(String noteId, String title, String markdown, FolderRef folder, List<String> tags,
                                 int version, Instant createdAt, Instant updatedAt, Permissions permissions,
                                 NoteTypography typography) {
    }

    public record NoteTypography(Integer scalePercent, String fontFamily, Map<String, Integer> overrides) {
    }

    public record FolderRef(String folderId, String name) {
    }

    public record Permissions(boolean canEdit, boolean canShare) {
    }

    public record NoteContentSaveRequest(@NotNull Integer baseVersion, @NotNull String markdown,
                                         @NotNull Instant clientSavedAt) {
    }

    public record NoteContentSaveData(String noteId, int version, Instant savedAt, String status,
                                      Map<String, Object> conflict) {
    }

    public record NoteDraftSaveRequest(String title, @NotNull String markdown, String folderId,
                                       @NotNull Integer baseVersion, @NotNull Instant clientSavedAt) {
    }

    public record NoteDraftSaveData(String noteId, String actorType, Instant savedAt,
                                    Instant expiresAt, String status) {
    }

    public record NoteDraftData(String noteId, String actorType, String title, String markdown, String folderId,
                                Integer baseVersion, Instant clientSavedAt, Instant savedAt, Instant expiresAt) {
    }

    public record NoteDraftListData(List<NoteDraftData> drafts) {
    }

    public record NoteDraftIdData(String noteId, String actorType, Instant issuedAt, String status) {
    }

    public record ClaimedNoteDraft(String noteId, String sourceNoteId, String title, int version) {
    }

    public record NoteDraftClaimData(int claimedCount, List<ClaimedNoteDraft> notes) {
    }

    public record NoteDraftFlushData(int flushedCount, int skippedCount) {
    }

    public record NoteMetadataPatchRequest(String title, String folderId, List<String> tags, Boolean archived,
                                           NoteTypography typography, Integer order) {
    }

    public record NoteMetadataData(String noteId, String title, String folderId, List<String> tags, int version,
                                   NoteTypography typography, Integer order) {
    }

    public record DeleteNoteData(String noteId, Instant deletedAt, Instant purgeAt) {
    }

    public record NoteVersionsData(List<NoteVersionItem> versions) {
    }

    public record NoteVersionItem(String versionId, int version, Instant savedAt) {
    }

    public record VersionRestoreData(int version) {
    }

    public record NoteViewRequest(@NotNull Instant viewedAt) {
    }

    public record RecentActivitiesData(List<RecentActivityItem> items) {
    }

    public record RecentActivityItem(String noteId, String title, String activityType, Instant activityAt) {
    }

    public record FolderCreateRequest(@NotBlank String name, String parentFolderId) {
    }

    public record FolderData(String folderId, String name, String parentFolderId, Integer depth) {
    }

    public record FolderTreeData(List<Map<String, Object>> folders) {
    }

    public record FolderPatchRequest(String name, String parentFolderId) {
    }

    public record DeleteFolderData(List<String> deletedFolderIds, List<String> deletedNoteIds, Instant deletedAt) {
    }

    public record TagsSuggestionData(List<TagSuggestionItem> tags) {
    }

    public record TagSuggestionItem(String tagId, String name, int usageCount) {
    }

    public record NoteTagsPutRequest(@NotNull List<String> tagNames) {
    }

    public record NoteTagsData(String noteId, List<String> tags) {
    }

    public record FavoritePutRequest(@NotNull Boolean enabled) {
    }

    public record FavoriteData(String targetType, String targetId, boolean enabled) {
    }

    public record NoteLinkCreateRequest(String targetNoteId, String targetTitle, @NotNull Boolean createIfMissing,
                                        String anchorText, String headingAnchor) {
    }

    public record NoteLinkData(String linkId, String sourceNoteId, String targetNoteId, String targetTitle,
                               String linkType, String anchorText, String headingAnchor) {
    }

    public record BacklinksData(List<BacklinkItem> backlinks) {
    }

    public record BacklinkItem(String sourceNoteId, String sourceTitle, String linkedText, Instant createdAt) {
    }

    public record GraphData(List<Map<String, Object>> nodes, List<Map<String, Object>> edges,
                            Map<String, Object> summaries, Instant lastViewedAt) {
    }

    public record GraphLayoutPutRequest(@NotEmpty List<@Valid GraphNodePosition> nodePositions, String quality) {
    }

    public record GraphNodePosition(@NotBlank String noteId, double x, double y) {
    }

    public record GraphLayoutData(String layoutId, Instant savedAt) {
    }

    public record ShareLinkCreateRequest(@NotBlank String noteId, @NotBlank String permission,
                                         @NotNull Instant expiresAt) {
    }

    public record ShareLinkPatchRequest(Instant expiresAt, Boolean revoked) {
    }

    public record ShareLinkData(String shareId, String url, String permission, Instant expiresAt, Boolean revoked) {
    }

    public record PublicSharedNoteData(String shareId, String noteId, String title, String markdown,
                                       ShareAuthor author, String permission, Instant expiresAt) {
    }

    public record ShareAuthor(String nickname) {
    }

    public record InternalNoteBulkCreateRequest(@NotBlank String userId, @NotBlank String source, String targetFolderId,
                                                @NotEmpty List<@Valid InternalNoteCreateItem> notes) {
    }

    public record InternalNoteCreateItem(String externalId, @NotBlank String title, @NotNull String markdown,
                                         List<String> tags, List<String> assets) {
    }

    public record InternalNoteBulkCreateData(List<InternalCreatedNote> createdNotes,
                                             List<Map<String, Object>> failedItems) {
    }

    public record InternalCreatedNote(String externalId, String noteId, int version) {
    }

    public record InternalNoteSnapshotData(String noteId, String title, String markdown, List<String> tags,
                                           String folderId, int version, Instant updatedAt) {
    }

    public record InternalUserWorkspaceStatsData(int noteCount, long storageBytes, List<InternalUserActivityDto> activities) {
    }

    public record InternalUserActivityDto(String noteId, String type, String title, Instant occurredAt) {
    }

    public record InternalWorkspaceMonitoringSummaryData(
            int totalNotes,
            long totalStorageBytes,
            int notesCreatedToday,
            List<InternalWorkspaceActivityDto> recentActivities
    ) {
    }

    public record InternalWorkspaceActivityDto(
            String activityId,
            String userId,
            String noteId,
            String title,
            String activityType,
            Instant occurredAt
    ) {
    }

    public record InternalNoteContentPatchRequest(@NotBlank String sourceService, @NotNull Integer baseVersion,
                                                  @NotBlank String patchType, Map<String, Object> patch,
                                                  String causationId) {
    }
}
