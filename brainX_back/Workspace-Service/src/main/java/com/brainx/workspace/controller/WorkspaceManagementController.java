package com.brainx.workspace.controller;

import com.brainx.workspace.dto.ApiResponse;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspaceCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspaceDetailData;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspaceListData;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspacePatchRequest;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import com.brainx.workspace.security.CurrentUser;
import com.brainx.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class WorkspaceManagementController {
    private final WorkspaceService workspaceService;
    private final CurrentUser currentUser;

    @GetMapping("/api/v1/workspaces")
    public ApiResponse<WorkspaceListData> listWorkspaces() {
        return ApiResponse.success(workspaceService.listWorkspaces(memberUserId()));
    }

    @GetMapping("/api/v1/workspaces/{documentGroupId}")
    public ApiResponse<WorkspaceDetailData> getWorkspace(@PathVariable String documentGroupId) {
        return ApiResponse.success(workspaceService.getWorkspace(memberUserId(), documentGroupId));
    }

    @PostMapping("/api/v1/workspaces")
    public ResponseEntity<ApiResponse<WorkspaceDetailData>> createWorkspace(@Valid @RequestBody WorkspaceCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(workspaceService.createWorkspace(memberUserId(), request)));
    }

    @PatchMapping("/api/v1/workspaces/{documentGroupId}")
    public ApiResponse<WorkspaceDetailData> patchWorkspace(@PathVariable String documentGroupId,
                                                           @Valid @RequestBody WorkspacePatchRequest request) {
        return ApiResponse.success(workspaceService.patchWorkspace(memberUserId(), documentGroupId, request));
    }

    private String memberUserId() {
        Actor actor = currentUser.actor();
        if (actor.type() == ActorType.GUEST) {
            throw new WorkspaceException(HttpStatus.FORBIDDEN, "GUEST_WORKSPACE_FORBIDDEN",
                    "Guests cannot create or manage workspaces.");
        }
        return actor.id();
    }
}
