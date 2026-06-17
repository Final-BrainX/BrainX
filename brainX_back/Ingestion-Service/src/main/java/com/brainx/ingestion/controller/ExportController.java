package com.brainx.ingestion.controller;

import com.brainx.ingestion.dto.request.IngestionRequest.ExportJobRequest;
import com.brainx.ingestion.dto.response.ApiResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobCreatedResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobStatusResponse;
import com.brainx.ingestion.service.ExportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/exports")
@RequiredArgsConstructor
public class ExportController {

    private final ExportService exportService;

    // POST /v1/exports
    @PostMapping
    public ResponseEntity<ApiResponse<ExportJobCreatedResponse>> createExportJob(
            Authentication auth,
            @Valid @RequestBody ExportJobRequest request) {
        ExportJobCreatedResponse data = exportService.createExportJob(auth.getName(), request);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(data, "문서 내보내기 요청이 접수되었습니다."));
    }

    // GET /v1/exports/{exportJobId}
    @GetMapping("/{exportJobId}")
    public ResponseEntity<ApiResponse<ExportJobStatusResponse>> getExportJobStatus(
            Authentication auth,
            @PathVariable String exportJobId) {
        ExportJobStatusResponse data = exportService.getExportJobStatus(auth.getName(), exportJobId);
        String message = "COMPLETED".equals(data.getStatus())
                ? "문서 내보내기가 완료되었습니다."
                : "FAILED".equals(data.getStatus())
                ? "문서 내보내기에 실패했습니다."
                : "내보내기 작업 조회 성공";
        return ResponseEntity.ok(ApiResponse.success(data, message));
    }
}
