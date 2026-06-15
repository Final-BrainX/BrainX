package com.brainx.workspace.controller;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.ApiResponse;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.service.ShareLinkService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/share-links")
@RequiredArgsConstructor
public class ShareLinkController {

    private final ShareLinkService shareLinkService;

    // POST /v1/share-links
    @PostMapping
    public ResponseEntity<ApiResponse<ShareLinkResponse>> createShareLink(
            Authentication auth,
            @RequestBody CreateShareLinkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(shareLinkService.createShareLink(auth.getName(), request)));
    }

    // PATCH /v1/share-links/{shareId}
    @PatchMapping("/{shareId}")
    public ResponseEntity<ApiResponse<ShareLinkResponse>> updateShareLink(
            Authentication auth,
            @PathVariable String shareId,
            @RequestBody UpdateShareLinkRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                shareLinkService.updateShareLink(auth.getName(), shareId, request)));
    }
}
