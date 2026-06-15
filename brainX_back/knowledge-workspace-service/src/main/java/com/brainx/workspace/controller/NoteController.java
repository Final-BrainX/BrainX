package com.brainx.workspace.controller;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.ApiResponse;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.service.NoteService;
import com.brainx.workspace.service.WorkspaceSyncService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
public class NoteController {

    private final NoteService noteService;
    private final WorkspaceSyncService workspaceSyncService;

    // GET /v1/workspace/sync
    @GetMapping("/workspace/sync")
    public ResponseEntity<ApiResponse<WorkspaceSyncResponse>> sync(
            Authentication auth,
            @RequestParam(required = false) String cursor) {
        String userId = auth.getName();
        return ResponseEntity.ok(ApiResponse.success(workspaceSyncService.sync(userId, cursor)));
    }

    // POST /v1/notes
    @PostMapping("/notes")
    public ResponseEntity<ApiResponse<NoteResponse>> createNote(
            Authentication auth,
            @Valid @RequestBody CreateNoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(noteService.createNote(auth.getName(), request)));
    }

    // GET /v1/notes/{noteId}
    @GetMapping("/notes/{noteId}")
    public ResponseEntity<ApiResponse<NoteDetailResponse>> getNote(
            Authentication auth,
            @PathVariable String noteId) {
        return ResponseEntity.ok(ApiResponse.success(noteService.getNote(auth.getName(), noteId)));
    }

    // PUT /v1/notes/{noteId}/content
    @PutMapping("/notes/{noteId}/content")
    public ResponseEntity<ApiResponse<NoteSaveResponse>> saveContent(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody SaveNoteContentRequest request) {
        return ResponseEntity.ok(ApiResponse.success(noteService.saveNoteContent(auth.getName(), noteId, request)));
    }

    // PATCH /v1/notes/{noteId}/metadata
    @PatchMapping("/notes/{noteId}/metadata")
    public ResponseEntity<ApiResponse<NoteResponse>> updateMetadata(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody UpdateNoteMetadataRequest request) {
        return ResponseEntity.ok(ApiResponse.success(noteService.updateNoteMetadata(auth.getName(), noteId, request)));
    }

    // DELETE /v1/notes/{noteId}
    @DeleteMapping("/notes/{noteId}")
    public ResponseEntity<ApiResponse<DeleteNoteResponse>> deleteNote(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody DeleteNoteRequest request) {
        return ResponseEntity.ok(ApiResponse.success(noteService.deleteNote(auth.getName(), noteId, request)));
    }

    // POST /v1/notes/{noteId}/views
    @PostMapping("/notes/{noteId}/views")
    public ResponseEntity<ApiResponse<OkResponse>> recordView(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody(required = false) NoteViewRequest request) {
        if (request == null) request = new NoteViewRequest();
        return ResponseEntity.ok(ApiResponse.success(noteService.recordNoteView(auth.getName(), noteId, request)));
    }

    // GET /v1/recent-activities
    @GetMapping("/recent-activities")
    public ResponseEntity<ApiResponse<List<RecentActivityResponse>>> getRecentActivities(
            Authentication auth,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(ApiResponse.success(noteService.getRecentActivities(auth.getName(), limit)));
    }

    // PUT /v1/notes/{noteId}/tags
    @PutMapping("/notes/{noteId}/tags")
    public ResponseEntity<ApiResponse<List<TagResponse>>> updateTags(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody UpdateTagsRequest request) {
        return ResponseEntity.ok(ApiResponse.success(noteService.updateNoteTags(auth.getName(), noteId, request)));
    }

    // GET /v1/tags/suggestions
    @GetMapping("/tags/suggestions")
    public ResponseEntity<ApiResponse<List<TagResponse>>> suggestTags(
            Authentication auth,
            @RequestParam String q) {
        return ResponseEntity.ok(ApiResponse.success(noteService.suggestTags(auth.getName(), q)));
    }

    // PUT /v1/favorites/{targetType}/{targetId}
    @PutMapping("/favorites/{targetType}/{targetId}")
    public ResponseEntity<ApiResponse<FavoriteResponse>> setFavorite(
            Authentication auth,
            @PathVariable String targetType,
            @PathVariable String targetId,
            @RequestBody FavoriteRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                noteService.setFavorite(auth.getName(), targetType, targetId, request)));
    }

    // GET /v1/notes/{noteId}/backlinks
    @GetMapping("/notes/{noteId}/backlinks")
    public ResponseEntity<ApiResponse<List<BacklinkResponse>>> getBacklinks(
            Authentication auth,
            @PathVariable String noteId) {
        return ResponseEntity.ok(ApiResponse.success(noteService.getBacklinks(auth.getName(), noteId)));
    }

    // POST /v1/notes/{noteId}/links
    @PostMapping("/notes/{noteId}/links")
    public ResponseEntity<ApiResponse<NoteLinkResponse>> createLink(
            Authentication auth,
            @PathVariable String noteId,
            @RequestBody CreateNoteLinkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(noteService.createNoteLink(auth.getName(), noteId, request)));
    }

    // DELETE /v1/notes/{noteId}/links/{linkId}
    @DeleteMapping("/notes/{noteId}/links/{linkId}")
    public ResponseEntity<ApiResponse<OkResponse>> deleteLink(
            Authentication auth,
            @PathVariable String noteId,
            @PathVariable String linkId) {
        return ResponseEntity.ok(ApiResponse.success(noteService.deleteNoteLink(auth.getName(), noteId, linkId)));
    }

    // GET /v1/graph
    @GetMapping("/graph")
    public ResponseEntity<ApiResponse<GraphResponse>> getGraph(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(noteService.getGraph(auth.getName())));
    }
}
