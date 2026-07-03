package com.brainx.intelligence.clustering.application.port.outbound;

import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.clustering.domain.ClusterJob;

public interface ClusterJobStore {

    ClusterJob save(ClusterJob job);

    Optional<ClusterJob> findByUserIdAndClusterJobId(String userId, String clusterJobId);

    Optional<ClusterJob> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    List<ClusterJob> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit);
}
