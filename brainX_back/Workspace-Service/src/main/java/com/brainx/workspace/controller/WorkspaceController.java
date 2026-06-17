package com.brainx.workspace.controller;

import com.brainx.workspace.dto.ApiResponse;
import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.security.CurrentUser;
import com.brainx.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequiredArgsConstructor
public class WorkspaceController {
    private final WorkspaceService workspaceService;
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
                .body(ApiResponse.success(workspaceService.createNote(currentUser.userId(), request)));
    }

    @GetMapping("/api/v1/notes/{noteId}")
    public ApiResponse<NoteDetailData> getNote(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.getNote(currentUser.userId(), noteId));
    }

    @DeleteMapping("/api/v1/notes/{noteId}")
    public ApiResponse<DeleteNoteData> deleteNote(@PathVariable String noteId, @RequestParam String mode) {
        return ApiResponse.success(workspaceService.deleteNote(currentUser.userId(), noteId, mode));
    }

    @PutMapping("/api/v1/notes/{noteId}/content")
    public ApiResponse<NoteContentSaveData> saveNoteContent(@PathVariable String noteId,
                                                            @Valid @RequestBody NoteContentSaveRequest request) {
        return ApiResponse.success(workspaceService.saveContent(currentUser.userId(), noteId, request));
    }

    @PatchMapping("/api/v1/notes/{noteId}/metadata")
    public ApiResponse<NoteMetadataData> patchNoteMetadata(@PathVariable String noteId,
                                                           @RequestBody NoteMetadataPatchRequest request) {
        return ApiResponse.success(workspaceService.patchMetadata(currentUser.userId(), noteId, request));
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
    public ApiResponse<Void> deleteFolder(@PathVariable String folderId, @Valid @RequestBody FolderDeleteRequest request) {
        return ApiResponse.success(workspaceService.deleteFolder(currentUser.userId(), folderId, request));
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

    @PostMapping("/api/v1/share-links")
    public ResponseEntity<ApiResponse<ShareLinkData>> createShareLink(@Valid @RequestBody ShareLinkCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createShareLink(currentUser.userId(), request)));
    }

    @GetMapping("/api/v1/share-links/{shareId}")
    public ApiResponse<PublicSharedNoteData> getPublicSharedNote(@PathVariable String shareId) {
        return ApiResponse.success(workspaceService.publicShare(shareId));
    }

    @PatchMapping("/api/v1/share-links/{shareId}")
    public ApiResponse<ShareLinkData> patchShareLink(@PathVariable String shareId, @RequestBody ShareLinkPatchRequest request) {
        return ApiResponse.success(workspaceService.patchShareLink(currentUser.userId(), shareId, request));
    }
}
