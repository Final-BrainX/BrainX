package com.brainx.workspace.controller;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.ApiResponse;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.service.FolderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/folders")
@RequiredArgsConstructor
public class FolderController {

    private final FolderService folderService;

    // POST /v1/folders
    @PostMapping
    public ResponseEntity<ApiResponse<FolderResponse>> createFolder(
            Authentication auth,
            @Valid @RequestBody CreateFolderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(folderService.createFolder(auth.getName(), request)));
    }

    // PATCH /v1/folders/{folderId}
    @PatchMapping("/{folderId}")
    public ResponseEntity<ApiResponse<FolderResponse>> updateFolder(
            Authentication auth,
            @PathVariable String folderId,
            @RequestBody UpdateFolderRequest request) {
        return ResponseEntity.ok(ApiResponse.success(folderService.updateFolder(auth.getName(), folderId, request)));
    }

    // DELETE /v1/folders/{folderId}
    @DeleteMapping("/{folderId}")
    public ResponseEntity<ApiResponse<OkResponse>> deleteFolder(
            Authentication auth,
            @PathVariable String folderId,
            @RequestBody DeleteFolderRequest request) {
        return ResponseEntity.ok(ApiResponse.success(folderService.deleteFolder(auth.getName(), folderId, request)));
    }

    // GET /v1/folders
    @GetMapping
    public ResponseEntity<ApiResponse<List<FolderResponse>>> getFolders(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(folderService.getFolders(auth.getName())));
    }
}
