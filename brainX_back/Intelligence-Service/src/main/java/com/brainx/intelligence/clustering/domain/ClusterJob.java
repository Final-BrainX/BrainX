package com.brainx.intelligence.clustering.domain;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record ClusterJob(
    String clusterJobId,
    String userId,
    String documentGroupId,
    ClusterJobStatus status,
    Map<String, Object> scope,
    Map<String, Object> algorithmOptions,
    List<Cluster> clusters,
    String modelId,
    String llmRunId,
    String idempotencyKey,
    String failureMessage,
    Instant createdAt,
    Instant completedAt
) {

    public ClusterJob {
        clusterJobId = requireText(clusterJobId, "clusterJobId");
        userId = requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        status = status == null ? ClusterJobStatus.PENDING : status;
        scope = scope == null ? Map.of() : new LinkedHashMap<>(scope);
        algorithmOptions = algorithmOptions == null ? Map.of() : new LinkedHashMap<>(algorithmOptions);
        clusters = clusters == null ? List.of() : List.copyOf(clusters);
        modelId = modelId == null ? "" : modelId;
        llmRunId = normalizeNullable(llmRunId);
        idempotencyKey = normalizeNullable(idempotencyKey);
        failureMessage = normalizeNullable(failureMessage);
        createdAt = createdAt == null ? Instant.EPOCH : createdAt;
    }

    public ClusterJob(
        String clusterJobId,
        String userId,
        String documentGroupId,
        ClusterJobStatus status,
        Map<String, Object> scope,
        Map<String, Object> algorithmOptions,
        List<Cluster> clusters,
        String modelId,
        String idempotencyKey,
        String failureMessage,
        Instant createdAt,
        Instant completedAt
    ) {
        this(
            clusterJobId,
            userId,
            documentGroupId,
            status,
            scope,
            algorithmOptions,
            clusters,
            modelId,
            null,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    public static ClusterJob running(
        String clusterJobId,
        String userId,
        String documentGroupId,
        Map<String, Object> scope,
        Map<String, Object> algorithmOptions,
        String modelId,
        String idempotencyKey,
        Instant createdAt
    ) {
        return new ClusterJob(
            clusterJobId,
            userId,
            documentGroupId,
            ClusterJobStatus.RUNNING,
            scope,
            algorithmOptions,
            List.of(),
            modelId,
            null,
            idempotencyKey,
            null,
            createdAt,
            null
        );
    }

    public ClusterJob completed(List<Cluster> completedClusters, Instant completedAt) {
        return new ClusterJob(
            clusterJobId,
            userId,
            documentGroupId,
            ClusterJobStatus.COMPLETED,
            scope,
            algorithmOptions,
            completedClusters,
            modelId,
            llmRunId,
            idempotencyKey,
            null,
            createdAt,
            completedAt
        );
    }

    public ClusterJob failed(String message, Instant completedAt) {
        return new ClusterJob(
            clusterJobId,
            userId,
            documentGroupId,
            ClusterJobStatus.FAILED,
            scope,
            algorithmOptions,
            List.of(),
            modelId,
            llmRunId,
            idempotencyKey,
            message,
            createdAt,
            completedAt
        );
    }

    public ClusterJob withLlmRunId(String llmRunId) {
        return new ClusterJob(
            clusterJobId,
            userId,
            documentGroupId,
            status,
            scope,
            algorithmOptions,
            clusters,
            modelId,
            llmRunId,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
