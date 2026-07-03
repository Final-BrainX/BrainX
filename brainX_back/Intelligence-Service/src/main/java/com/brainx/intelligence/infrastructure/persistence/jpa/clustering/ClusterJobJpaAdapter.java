package com.brainx.intelligence.infrastructure.persistence.jpa.clustering;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class ClusterJobJpaAdapter implements ClusterJobStore {

    private final ClusterJobJpaRepository repository;
    private final ObjectMapper objectMapper;

    public ClusterJobJpaAdapter(ClusterJobJpaRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    public ClusterJob save(ClusterJob job) {
        return repository.save(ClusterJobJpaEntity.fromDomain(job, objectMapper))
            .toDomain(objectMapper);
    }

    @Override
    public Optional<ClusterJob> findByUserIdAndClusterJobId(String userId, String clusterJobId) {
        return repository.findByUserIdAndClusterJobId(userId, clusterJobId)
            .map(entity -> entity.toDomain(objectMapper));
    }

    @Override
    public Optional<ClusterJob> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey) {
        return repository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)
            .map(entity -> entity.toDomain(objectMapper));
    }

    @Override
    public List<ClusterJob> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit) {
        if (limit <= 0) {
            return List.of();
        }
        return repository.findByUserIdAndDocumentGroupIdOrderByCreatedAtDescClusterJobIdDesc(
                userId,
                documentGroupId,
                PageRequest.of(0, limit)
            ).stream()
            .map(entity -> entity.toDomain(objectMapper))
            .toList();
    }
}
