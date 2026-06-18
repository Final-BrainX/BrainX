package com.brainx.ingestion.controller;

import com.brainx.ingestion.dto.request.IngestionRequest.PublishJobRequest;
import com.brainx.ingestion.dto.response.ApiResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.PublishJobResponse;
import com.brainx.ingestion.service.PublishService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/publish-jobs")
@RequiredArgsConstructor
public class PublishController {

    private final PublishService publishService;

    // POST /v1/publish-jobs
    @PostMapping
    public ResponseEntity<ApiResponse<PublishJobResponse>> createPublishJob(
            Authentication auth,
            @Valid @RequestBody PublishJobRequest request) {
        String userId = auth != null ? auth.getName() : "anonymous";
        PublishJobResponse data = publishService.createPublishJob(userId, request);
        return ResponseEntity.ok(ApiResponse.success(data, "발행 콘텐츠가 준비됐습니다. 클립보드를 확인하세요."));
    }
}
