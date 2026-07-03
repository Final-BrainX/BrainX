package com.brainx.intelligence.clustering.application.port.inbound;

import java.time.Instant;

import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobLatestState;

public interface GetLatestClusterJobUseCase {

    LatestClusterJob getLatestClusterJob(GetLatestClusterJobQuery query);

    record GetLatestClusterJobQuery(
        String userId,
        String documentGroupId
    ) {
    }

    record LatestClusterJob(
        String documentGroupId,
        int searchableNoteCount,
        Instant latestNoteUpdatedAt,
        ClusterJobLatestState state,
        ClusterJob job
    ) {
    }
}
