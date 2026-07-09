package com.brainx.workspace.controller;

import com.brainx.workspace.dto.ApiResponse;
import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class InternalWorkspaceController {
    private final WorkspaceService workspaceService;

    @PostMapping("/internal/v1/workspace/notes/bulk-create")
    public ApiResponse<InternalNoteBulkCreateData> bulkCreateNotesInternal(@Valid @RequestBody InternalNoteBulkCreateRequest request) {
        return ApiResponse.success(workspaceService.bulkCreate(request));
    }

    @DeleteMapping("/internal/v1/workspace/users/{userId}/notes/{noteId}")
    public ApiResponse<DeleteNoteData> deleteNoteInternal(@PathVariable String userId,
                                                           @PathVariable String noteId,
                                                           @RequestParam String mode) {
        return ApiResponse.success(workspaceService.deleteNote(userId, noteId, mode));
    }

    @GetMapping("/internal/v1/workspace/notes/{noteId}/snapshot")
    public ApiResponse<InternalNoteSnapshotData> getNoteSnapshotInternal(@PathVariable String noteId) {
        return ApiResponse.success(workspaceService.snapshot(noteId));
    }

    @PostMapping("/internal/v1/workspace/notes/{noteId}/content-patches")
    public ApiResponse<NoteContentSaveData> patchNoteContentInternal(@PathVariable String noteId,
                                                                     @Valid @RequestBody InternalNoteContentPatchRequest request) {
        return ApiResponse.success(workspaceService.patchContentInternal(noteId, request));
    }

    @GetMapping("/internal/v1/workspace/users/{userId}/stats")
    public ApiResponse<InternalUserWorkspaceStatsData> getUserWorkspaceStatsInternal(@PathVariable String userId) {
        return ApiResponse.success(workspaceService.getUserWorkspaceStats(userId));
    }

    @PostMapping("/internal/v1/workspace/users/{userId}/default-workspace")
    public ApiResponse<InternalDefaultWorkspaceData> getOrCreateDefaultWorkspaceInternal(@PathVariable String userId) {
        return ApiResponse.success(workspaceService.getOrCreateDefaultWorkspace(userId));
    }

    @GetMapping("/internal/v1/workspace/monitoring/summary")
    public ApiResponse<InternalWorkspaceMonitoringSummaryData> getWorkspaceMonitoringSummaryInternal() {
        return ApiResponse.success(workspaceService.getWorkspaceMonitoringSummary());
    }
}
