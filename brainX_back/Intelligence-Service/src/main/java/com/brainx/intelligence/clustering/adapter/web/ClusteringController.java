package com.brainx.intelligence.clustering.adapter.web;

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

import com.brainx.intelligence.clustering.application.port.inbound.GetClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetClusterJobUseCase.GetClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.GetLatestClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.LatestClusterJob;
import com.brainx.intelligence.clustering.application.port.inbound.InheritClusterUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.InheritClusterUseCase.ClusterInheritanceCommand;
import com.brainx.intelligence.clustering.application.port.inbound.InheritClusterUseCase.ClusterInheritanceResult;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase.ClusterJobCommand;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobLatestState;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
@Validated
public class ClusteringController {

    private final RequestClusterJobUseCase requestClusterJobUseCase;
    private final GetClusterJobUseCase getClusterJobUseCase;
    private final GetLatestClusterJobUseCase getLatestClusterJobUseCase;
    private final InheritClusterUseCase inheritClusterUseCase;

    public ClusteringController(
        RequestClusterJobUseCase requestClusterJobUseCase,
        GetClusterJobUseCase getClusterJobUseCase,
        GetLatestClusterJobUseCase getLatestClusterJobUseCase,
        InheritClusterUseCase inheritClusterUseCase
    ) {
        this.requestClusterJobUseCase = requestClusterJobUseCase;
        this.getClusterJobUseCase = getClusterJobUseCase;
        this.getLatestClusterJobUseCase = getLatestClusterJobUseCase;
        this.inheritClusterUseCase = inheritClusterUseCase;
    }

    @PostMapping("/api/v1/ai/cluster-inheritances")
    public ApiSuccessResponse<ClusterInheritanceData> inheritCluster(
        Principal principal,
        @Valid @RequestBody ClusterInheritanceRequest request
    ) {
        ClusterInheritanceResult result = inheritClusterUseCase.inheritCluster(new ClusterInheritanceCommand(
            userId(principal),
            request.documentGroupId(),
            request.noteId(),
            request.sourceNoteIds()
        ));
        return ApiSuccessResponse.ok(new ClusterInheritanceData(
            result.inherited(),
            result.noteId(),
            result.clusterId(),
            result.clusterJobId()
        ));
    }

    @PostMapping("/api/v1/ai/clusters")
    public ResponseEntity<ApiSuccessResponse<ClusterJobData>> requestClusterJob(
        Principal principal,
        @RequestHeader(name = "Idempotency-Key", required = false) @Size(max = 200) String idempotencyKey,
        @Valid @RequestBody ClusterJobCreateRequest request
    ) {
        ClusterJob job = requestClusterJobUseCase.requestClusterJob(new ClusterJobCommand(
            userId(principal),
            request.scope(),
            request.algorithmOptions(),
            idempotencyKey
        ));
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .body(ApiSuccessResponse.ok(toData(job)));
    }

    @GetMapping("/api/v1/ai/clusters/latest")
    public ApiSuccessResponse<ClusterJobLatestData> getLatestClusterJob(
        Principal principal,
        @RequestParam(name = "documentGroupId") @NotBlank String documentGroupId
    ) {
        LatestClusterJob latest = getLatestClusterJobUseCase.getLatestClusterJob(new GetLatestClusterJobQuery(
            userId(principal),
            documentGroupId
        ));
        return ApiSuccessResponse.ok(toLatestData(latest));
    }

    @GetMapping("/api/v1/ai/clusters/{clusterJobId}")
    public ApiSuccessResponse<ClusterJobData> getClusterJob(
        Principal principal,
        @PathVariable @NotBlank String clusterJobId
    ) {
        ClusterJob job = getClusterJobUseCase.getClusterJob(new GetClusterJobQuery(
            userId(principal),
            clusterJobId
        ));
        return ApiSuccessResponse.ok(toData(job));
    }

    private static ClusterJobData toData(ClusterJob job) {
        return new ClusterJobData(
            job.clusterJobId(),
            job.documentGroupId(),
            job.status(),
            job.llmRunId(),
            job.clusters().stream()
                .map(ClusteringController::toClusterMap)
                .toList(),
            job.createdAt(),
            job.completedAt(),
            job.failureMessage()
        );
    }

    private static ClusterJobLatestData toLatestData(LatestClusterJob latest) {
        return new ClusterJobLatestData(
            latest.documentGroupId(),
            latest.searchableNoteCount(),
            latest.latestNoteUpdatedAt(),
            latest.state(),
            latest.job() == null ? null : toData(latest.job())
        );
    }

    private static Map<String, Object> toClusterMap(Cluster cluster) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("clusterId", cluster.clusterId());
        values.put("title", cluster.title());
        values.put("summary", cluster.summary());
        values.put("noteIds", cluster.noteIds());
        values.put("keywords", cluster.keywords());
        values.put("confidence", cluster.confidence());
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

    record ClusterJobCreateRequest(
        @NotNull Map<String, Object> scope,
        Map<String, Object> algorithmOptions
    ) {
    }

    record ClusterInheritanceRequest(
        @NotBlank String documentGroupId,
        @NotBlank String noteId,
        @NotNull @Size(min = 2, max = 2) List<@NotBlank String> sourceNoteIds
    ) {
    }

    record ClusterInheritanceData(
        boolean inherited,
        String noteId,
        String clusterId,
        String clusterJobId
    ) {
    }

    record ClusterJobData(
        String clusterJobId,
        String documentGroupId,
        ClusterJobStatus status,
        String llmRunId,
        List<Map<String, Object>> clusters,
        Instant createdAt,
        Instant completedAt,
        String failureMessage
    ) {
    }

    record ClusterJobLatestData(
        String documentGroupId,
        int searchableNoteCount,
        Instant latestNoteUpdatedAt,
        ClusterJobLatestState state,
        ClusterJobData job
    ) {
    }
}
