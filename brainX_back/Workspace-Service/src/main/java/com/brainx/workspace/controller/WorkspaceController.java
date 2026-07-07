package com.brainx.workspace.controller;

import com.brainx.workspace.dto.ApiResponse;
import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import com.brainx.workspace.security.CurrentUser;
import com.brainx.workspace.service.NoteDraftPersistenceService;
import com.brainx.workspace.service.NoteDraftService;
import com.brainx.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class WorkspaceController {
    private final WorkspaceService workspaceService;
    private final NoteDraftService noteDraftService;
    private final NoteDraftPersistenceService noteDraftPersistenceService;
    private final CurrentUser currentUser;

    @GetMapping("/api/v1/workspace/sync")
    public ApiResponse<WorkspaceSyncData> syncWorkspace(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "false") boolean includeDeleted
    ) {
        return ApiResponse.success(workspaceService.syncWorkspace(currentUser.userId(), cursor, includeDeleted));
    }

    @PostMapping("/api/v1/notes")
    public ResponseEntity<ApiResponse<NoteCreatedData>> createNote(@Valid @RequestBody NoteCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createNote(memberUserId(), request)));
    }

    @GetMapping("/api/v1/notes")
    public ApiResponse<NoteListData> listNotes(
            @RequestParam(required = false) String folderId,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean includeDeleted
    ) {
        return ApiResponse.success(workspaceService.listNotes(currentUser.userId(), folderId, tag, q, includeDeleted));
    }

    @GetMapping("/api/v1/notes/{noteId}")
    public ApiResponse<NoteDetailData> getNote(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.getNote(currentUser.userId(), noteId));
    }

    @DeleteMapping("/api/v1/notes/{noteId}")
    public ApiResponse<DeleteNoteData> deleteNote(@PathVariable String noteId, @RequestParam String mode) {
        if (!"trash".equalsIgnoreCase(mode) && !"permanent".equalsIgnoreCase(mode)) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_DELETE_MODE", "Delete mode must be trash or permanent.");
        }
        Actor actor = currentUser.actor();
        // Redis draft은 USER/GUEST 둘 다 가질 수 있고, 노트가 아직 Postgres로 flush되기 전이거나
        // (자동 flush는 idle 10초+주기 30초라 그 사이 창이 있음) guest라서 애초에 Postgres에 못
        // 들어갔을 수 있다 — 어느 쪽이든 draft는 항상 먼저 지운다(없으면 no-op).
        noteDraftService.deleteDraft(actor, noteId);
        if (actor.type() == ActorType.GUEST) {
            // Guest는 Postgres에 노트를 가질 수 없으므로(memberUserId() 정책) 위 draft 삭제만으로
            // 충분하다 — workspaceService.deleteNote를 호출하면 항상 404로 끝난다.
            return ApiResponse.success(new DeleteNoteData(noteId, Instant.now(), null));
        }
        try {
            return ApiResponse.success(workspaceService.deleteNote(actor.id(), noteId, mode));
        } catch (WorkspaceException exception) {
            if ("NOTE_NOT_FOUND".equals(exception.getCode())) {
                // 아직 Postgres로 flush되지 않은 draft-only 노트 — 위에서 draft는 이미 지웠으므로
                // 사용자 입장에서는 정상적으로 삭제된 것이다.
                return ApiResponse.success(new DeleteNoteData(noteId, Instant.now(), null));
            }
            throw exception;
        }
    }

    @PutMapping("/api/v1/notes/{noteId}/content")
    public ApiResponse<NoteContentSaveData> saveNoteContent(@PathVariable String noteId,
                                                            @Valid @RequestBody NoteContentSaveRequest request) {
        return ApiResponse.success(workspaceService.saveContent(memberUserId(), noteId, request));
    }

    @PutMapping("/api/v1/notes/{noteId}/draft")
    public ApiResponse<NoteDraftSaveData> saveNoteDraft(@PathVariable String noteId,
                                                        @Valid @RequestBody NoteDraftSaveRequest request) {
        return ApiResponse.success(noteDraftService.saveDraft(currentUser.actor(), noteId, request));
    }

    @PostMapping("/api/v1/notes/draft-ids")
    public ApiResponse<NoteDraftIdData> issueNoteDraftId() {
        return ApiResponse.success(noteDraftService.issueDraftId(currentUser.actor()));
    }

    @GetMapping("/api/v1/notes/{noteId}/draft")
    public ApiResponse<NoteDraftData> getNoteDraft(@PathVariable String noteId) {
        return ApiResponse.success(noteDraftService.getDraft(currentUser.actor(), noteId));
    }

    @GetMapping("/api/v1/notes/drafts/list")
    public ApiResponse<NoteDraftListData> listNoteDrafts() {
        return ApiResponse.success(noteDraftService.listDrafts(currentUser.actor()));
    }

    @PostMapping("/api/v1/notes/drafts/claim")
    public ApiResponse<NoteDraftClaimData> claimGuestDrafts(
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId
    ) {
        if (guestId == null || guestId.isBlank()) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "GUEST_ID_REQUIRED",
                    "X-Guest-Id is required to claim guest drafts.");
        }
        return ApiResponse.success(noteDraftPersistenceService.claimGuestDrafts(memberUserId(), guestId));
    }

    @PatchMapping("/api/v1/notes/{noteId}/metadata")
    public ApiResponse<NoteMetadataData> patchNoteMetadata(@PathVariable String noteId,
                                                           @RequestBody NoteMetadataPatchRequest request) {
        return ApiResponse.success(workspaceService.patchMetadata(memberUserId(), noteId, request));
    }

    @GetMapping("/api/v1/notes/{noteId}/versions")
    public ApiResponse<NoteVersionsData> listNoteVersions(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.versions(currentUser.userId(), noteId));
    }

    @PostMapping("/api/v1/notes/{noteId}/versions/{versionId}/restore")
    public ApiResponse<VersionRestoreData> restoreNoteVersion(@PathVariable String noteId, @PathVariable String versionId) {
        return ApiResponse.success(workspaceService.restoreVersion(currentUser.userId(), noteId, versionId));
    }

    @PostMapping("/api/v1/notes/{noteId}/views")
    public ApiResponse<Void> recordNoteView(@PathVariable String noteId, @Valid @RequestBody NoteViewRequest request) {
        return ApiResponse.success(workspaceService.recordView(currentUser.userId(), noteId, request));
    }

    @GetMapping("/api/v1/recent-activities")
    public ApiResponse<RecentActivitiesData> listRecentActivities(@RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.success(workspaceService.recentActivities(currentUser.userId(), limit));
    }

    @GetMapping("/api/v1/workspaces/me/stats")
    public ApiResponse<InternalUserWorkspaceStatsData> getMyWorkspaceStats() {
        return ApiResponse.success(workspaceService.getUserWorkspaceStats(memberUserId()));
    }

    @PostMapping("/api/v1/folders")
    public ResponseEntity<ApiResponse<FolderData>> createFolder(@Valid @RequestBody FolderCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createFolder(currentUser.userId(), request)));
    }

    @GetMapping("/api/v1/folders/tree")
    public ApiResponse<FolderTreeData> getFolderTree() {
        return ApiResponse.success(workspaceService.folderTree(currentUser.userId()));
    }

    @PatchMapping("/api/v1/folders/{folderId}")
    public ApiResponse<FolderData> patchFolder(@PathVariable String folderId, @RequestBody FolderPatchRequest request) {
        return ApiResponse.success(workspaceService.patchFolder(currentUser.userId(), folderId, request));
    }

    @DeleteMapping("/api/v1/folders/{folderId}")
    public ApiResponse<DeleteFolderData> deleteFolder(
            @PathVariable String folderId,
            @RequestParam(defaultValue = "trash") String mode
    ) {
        Actor actor = currentUser.actor();
        DeleteFolderData result = workspaceService.deleteFolder(actor.id(), folderId, mode);
        // Postgres cascade가 못 보는 draft-only 노트(이 actor가 그 폴더에서 아직 flush 전인 것)도
        // 같은 폴더 id 집합 기준으로 정리한다 — orphan draft 방지.
        noteDraftService.deleteDraftsByFolder(actor, result.deletedFolderIds());
        return ApiResponse.success(result);
    }

    @GetMapping("/api/v1/tags/suggestions")
    public ApiResponse<TagsSuggestionData> suggestTags(@RequestParam String q) {
        return ApiResponse.success(workspaceService.tagSuggestions(currentUser.userId(), q));
    }

    @PutMapping("/api/v1/notes/{noteId}/tags")
    public ApiResponse<NoteTagsData> putNoteTags(@PathVariable String noteId, @Valid @RequestBody NoteTagsPutRequest request) {
        return ApiResponse.success(workspaceService.putTags(currentUser.userId(), noteId, request));
    }

    @PutMapping("/api/v1/favorites/{targetType}/{targetId}")
    public ApiResponse<FavoriteData> putFavorite(@PathVariable String targetType, @PathVariable String targetId,
                                                 @Valid @RequestBody FavoritePutRequest request) {
        return ApiResponse.success(workspaceService.putFavorite(currentUser.userId(), targetType, targetId, request));
    }

    @PostMapping("/api/v1/notes/{noteId}/links")
    public ResponseEntity<ApiResponse<NoteLinkData>> createNoteLink(@PathVariable String noteId,
                                                                    @Valid @RequestBody NoteLinkCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createLink(currentUser.userId(), noteId, request)));
    }

    @DeleteMapping("/api/v1/notes/{noteId}/links/{linkId}")
    public ApiResponse<Void> deleteNoteLink(@PathVariable String noteId, @PathVariable String linkId) {
        return ApiResponse.success(workspaceService.deleteLink(currentUser.userId(), noteId, linkId));
    }

    @GetMapping("/api/v1/notes/{noteId}/backlinks")
    public ApiResponse<BacklinksData> getBacklinks(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.backlinks(currentUser.userId(), noteId));
    }

    @GetMapping("/api/v1/graph")
    public ApiResponse<GraphData> getGraph(@RequestParam(required = false) String folderId,
                                           @RequestParam(required = false) String tag,
                                           @RequestParam(required = false) LocalDate since,
                                           @RequestParam(required = false) LocalDate until) {
        return ApiResponse.success(workspaceService.graph(currentUser.userId(), folderId, tag, since, until));
    }

    @PutMapping("/api/v1/graph/layouts/{layoutId}")
    public ApiResponse<GraphLayoutData> saveGraphLayout(@PathVariable String layoutId,
                                                        @Valid @RequestBody GraphLayoutPutRequest request) {
        return ApiResponse.success(workspaceService.saveGraphLayout(currentUser.userId(), layoutId, request));
    }

    @GetMapping("/api/v1/notes/{noteId}/share-links")
    public ApiResponse<List<ShareLinkData>> listShareLinks(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.listShareLinks(currentUser.userId(), noteId));
    }

    @PostMapping("/api/v1/share-links")
    public ResponseEntity<ApiResponse<ShareLinkData>> createShareLink(@Valid @RequestBody ShareLinkCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createShareLink(currentUser.userId(), request)));
    }

    @GetMapping("/api/v1/share-links/{shareId}")
    public ApiResponse<PublicSharedNoteData> getPublicSharedNote(@PathVariable String shareId) {
        return ApiResponse.success(workspaceService.publicShare(shareId));
    }

    @GetMapping("/api/v1/share-links/by-note/{noteId}")
    public ApiResponse<ShareLinkData> getPublicShareLinkForNote(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.publicShareLinkForNote(noteId));
    }

    @GetMapping("/api/v1/share-links/{shareId}/linked-note/{noteId}")
    public ApiResponse<PublicSharedNoteData> getLinkedNote(@PathVariable String shareId, @PathVariable String noteId) {
        return ApiResponse.success(workspaceService.linkedNoteContent(shareId, noteId));
    }

    @PatchMapping("/api/v1/share-links/{shareId}")
    public ApiResponse<ShareLinkData> patchShareLink(@PathVariable String shareId, @RequestBody ShareLinkPatchRequest request) {
        return ApiResponse.success(workspaceService.patchShareLink(currentUser.userId(), shareId, request));
    }

    private String memberUserId() {
        Actor actor = currentUser.actor();
        if (actor.type() == ActorType.GUEST) {
            throw new WorkspaceException(HttpStatus.FORBIDDEN, "GUEST_POSTGRES_SAVE_FORBIDDEN",
                    "Guest drafts are stored in Redis only. Sign up or log in before saving to PostgreSQL.");
        }
        return actor.id();
    }

    @PostMapping("/api/v1/graph/sync")
    public ApiResponse<java.util.Map<String, Object>> syncGraph() {
        return ApiResponse.success(workspaceService.syncGraph());
    }
}
