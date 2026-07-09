package com.brainx.intelligence.infrastructure.persistence.jpa.clustering;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "intelligence_cluster_jobs",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_cluster_jobs_user_idempotency",
        columnNames = {"user_id", "idempotency_key"}
    )
)
public class ClusterJobJpaEntity {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<Cluster>> CLUSTER_LIST_TYPE = new TypeReference<>() {
    };

    @Id
    @Column(name = "cluster_job_id", nullable = false, length = 120)
    private String clusterJobId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "document_group_id", nullable = false, length = 120)
    private String documentGroupId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private ClusterJobStatus status;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "scope_json", nullable = false)
    private String scopeJson;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "algorithm_options_json", nullable = false)
    private String algorithmOptionsJson;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "clusters_json", nullable = false)
    private String clustersJson;

    @Column(name = "model_id", nullable = false, length = 120)
    private String modelId;

    @Column(name = "llm_run_id", length = 120)
    private String llmRunId;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected ClusterJobJpaEntity() {
    }

    static ClusterJobJpaEntity fromDomain(ClusterJob job, ObjectMapper objectMapper) {
        ClusterJobJpaEntity entity = new ClusterJobJpaEntity();
        entity.clusterJobId = job.clusterJobId();
        entity.userId = job.userId();
        entity.documentGroupId = job.documentGroupId();
        entity.status = job.status();
        entity.scopeJson = toJson(objectMapper, job.scope());
        entity.algorithmOptionsJson = toJson(objectMapper, job.algorithmOptions());
        entity.clustersJson = toJson(objectMapper, job.clusters());
        entity.modelId = job.modelId();
        entity.llmRunId = job.llmRunId();
        entity.idempotencyKey = job.idempotencyKey();
        entity.failureMessage = job.failureMessage();
        entity.createdAt = job.createdAt();
        entity.completedAt = job.completedAt();
        return entity;
    }

    ClusterJob toDomain(ObjectMapper objectMapper) {
        return new ClusterJob(
            clusterJobId,
            userId,
            documentGroupId,
            status,
            fromJson(objectMapper, scopeJson, MAP_TYPE, Map.of()),
            fromJson(objectMapper, algorithmOptionsJson, MAP_TYPE, Map.of()),
            fromJson(objectMapper, clustersJson, CLUSTER_LIST_TYPE, List.of()),
            modelId,
            llmRunId,
            idempotencyKey,
            failureMessage,
            createdAt,
            completedAt
        );
    }

    private static String toJson(ObjectMapper objectMapper, Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize cluster job JSON.", exception);
        }
    }

    private static <T> T fromJson(ObjectMapper objectMapper, String value, TypeReference<T> type, T defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize cluster job JSON.", exception);
        }
    }
}
