package com.brainx.ingestion.service;

import com.brainx.ingestion.dto.request.IngestionRequest.ExportJobRequest;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobCreatedResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobStatusResponse;
import com.brainx.ingestion.entity.ExportJob;
import com.brainx.ingestion.entity.ExportJob.ClientType;
import com.brainx.ingestion.entity.ExportJob.ExportFormat;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.repository.ExportJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExportService {

    private final ExportJobRepository exportJobRepository;

    @Value("${cdn.base-url}")
    private String cdnBaseUrl;

    @Transactional
    public ExportJobCreatedResponse createExportJob(String userId, ExportJobRequest request) {
        ExportFormat format;
        try {
            format = ExportFormat.valueOf(request.getFormat().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw BrainXException.badRequest("INVALID_FORMAT", "지원하지 않는 형식입니다. PDF, TXT, MD 중 하나를 선택하세요.");
        }

        ClientType clientType = ClientType.WEB;
        if (request.getClientType() != null) {
            try {
                clientType = ClientType.valueOf(request.getClientType().toUpperCase());
            } catch (IllegalArgumentException ignored) {}
        }

        ExportJob job = ExportJob.builder()
                .userId(userId)
                .noteId(request.getNoteId())
                .format(format)
                .clientType(clientType)
                .build();
        exportJobRepository.save(job);

        // MVP: 내보내기 URL 즉시 생성 (실제로는 비동기 처리)
        String fileName = request.getNoteId() + "." + format.name().toLowerCase();
        job.setDownloadUrl(cdnBaseUrl + "/export/" + fileName);
        job.setStatus(ExportJob.JobStatus.COMPLETED);
        exportJobRepository.save(job);

        log.info("내보내기 작업 생성: jobId={}, userId={}, format={}", job.getExportJobId(), userId, format);
        return ExportJobCreatedResponse.from(job);
    }

    public ExportJobStatusResponse getExportJobStatus(String userId, String exportJobId) {
        ExportJob job = exportJobRepository
                .findByExportJobIdAndUserId(exportJobId, userId)
                .orElseThrow(() -> BrainXException.notFound("내보내기 작업을 찾을 수 없습니다"));
        return ExportJobStatusResponse.from(job);
    }
}
