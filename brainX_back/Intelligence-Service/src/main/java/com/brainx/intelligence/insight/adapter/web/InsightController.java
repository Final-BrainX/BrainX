package com.brainx.intelligence.insight.adapter.web;

import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase.GetInsightReportQuery;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.GetLatestInsightReportQuery;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.LatestInsightReport;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase.InsightReportCommand;
import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportLatestState;
import com.brainx.intelligence.insight.domain.InsightReportStatus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@Validated
public class InsightController {

    private final RequestInsightReportUseCase requestInsightReportUseCase;
    private final GetInsightReportUseCase getInsightReportUseCase;
    private final GetLatestInsightReportUseCase getLatestInsightReportUseCase;

    public InsightController(
        RequestInsightReportUseCase requestInsightReportUseCase,
        GetInsightReportUseCase getInsightReportUseCase,
        GetLatestInsightReportUseCase getLatestInsightReportUseCase
    ) {
        this.requestInsightReportUseCase = requestInsightReportUseCase;
        this.getInsightReportUseCase = getInsightReportUseCase;
        this.getLatestInsightReportUseCase = getLatestInsightReportUseCase;
    }

    @PostMapping("/api/v1/ai/insight-reports")
    public ResponseEntity<ApiSuccessResponse<InsightReportData>> requestInsightReport(
        Principal principal,
        @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
        @Valid @RequestBody InsightReportCreateRequest request
    ) {
        InsightReport report = requestInsightReportUseCase.requestInsightReport(new InsightReportCommand(
            userId(principal),
            request.scope(),
            request.includeLearningRecommendations(),
            idempotencyKey
        ));
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .body(ApiSuccessResponse.ok(toData(report)));
    }

    @GetMapping("/api/v1/ai/insight-reports/latest")
    public ApiSuccessResponse<InsightReportLatestData> getLatestInsightReport(
        Principal principal,
        @RequestParam(name = "documentGroupId", required = false, defaultValue = "default") String documentGroupId
    ) {
        LatestInsightReport latest = getLatestInsightReportUseCase.getLatestInsightReport(new GetLatestInsightReportQuery(
            userId(principal),
            documentGroupId
        ));
        return ApiSuccessResponse.ok(toLatestData(latest));
    }

    @GetMapping("/api/v1/ai/insight-reports/{reportId}")
    public ApiSuccessResponse<InsightReportData> getInsightReport(
        Principal principal,
        @PathVariable @NotBlank String reportId
    ) {
        InsightReport report = getInsightReportUseCase.getInsightReport(new GetInsightReportQuery(
            userId(principal),
            reportId
        ));
        return ApiSuccessResponse.ok(toData(report));
    }

    private static InsightReportData toData(InsightReport report) {
        return new InsightReportData(
            report.reportId(),
            report.status(),
            report.summary(),
            report.knowledgeGaps(),
            report.recommendations().stream()
                .map(InsightController::toRecommendationMap)
                .toList(),
            report.completedAt(),
            report.failureMessage()
        );
    }

    private static InsightReportLatestData toLatestData(LatestInsightReport latest) {
        return new InsightReportLatestData(
            latest.documentGroupId(),
            latest.searchableNoteCount(),
            latest.latestNoteUpdatedAt(),
            latest.state(),
            latest.report() == null ? null : toData(latest.report())
        );
    }

    private static Map<String, Object> toRecommendationMap(InsightRecommendation recommendation) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("type", recommendation.type());
        values.put("title", recommendation.title());
        values.put("reason", recommendation.reason());
        values.put("noteIds", recommendation.noteIds());
        values.put("priority", recommendation.priority());
        return values;
    }

    private static String userId(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getName() != null && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        throw new IllegalArgumentException("Authenticated user is required.");
    }

    record InsightReportCreateRequest(
        @NotNull Map<String, Object> scope,
        Boolean includeLearningRecommendations
    ) {
    }

    record InsightReportData(
        String reportId,
        InsightReportStatus status,
        String summary,
        List<String> knowledgeGaps,
        List<Map<String, Object>> recommendations,
        Instant completedAt,
        String failureMessage
    ) {
    }

    record InsightReportLatestData(
        String documentGroupId,
        int searchableNoteCount,
        Instant latestNoteUpdatedAt,
        InsightReportLatestState state,
        InsightReportData report
    ) {
    }
}
