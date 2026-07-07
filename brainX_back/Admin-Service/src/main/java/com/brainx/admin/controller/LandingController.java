package com.brainx.admin.controller;

import com.brainx.admin.dto.AdminDtos.LandingDesktopDownloadData;
import com.brainx.admin.dto.AdminDtos.LandingDesktopDownloadRequest;
import com.brainx.admin.dto.ApiResponse;
import com.brainx.admin.service.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/landing")
public class LandingController {
    private final AdminService adminService;

    public LandingController(AdminService adminService) {
        this.adminService = adminService;
    }

    @PostMapping("/desktop-downloads")
    public ResponseEntity<ApiResponse<LandingDesktopDownloadData>> recordDesktopDownload(
            @Valid @RequestBody LandingDesktopDownloadRequest request,
            HttpServletRequest httpServletRequest
    ) {
        String forwardedFor = httpServletRequest.getHeader("X-Forwarded-For");
        String remoteAddress = forwardedFor != null && !forwardedFor.isBlank()
                ? forwardedFor.split(",")[0].trim()
                : httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(adminService.recordDesktopDownload(request, remoteAddress, userAgent)));
    }
}
