package com.brainx.intelligence.clustering.application.port.inbound;

import java.util.List;

public interface InheritClusterUseCase {

    ClusterInheritanceResult inheritCluster(ClusterInheritanceCommand command);

    record ClusterInheritanceCommand(
        String userId,
        String documentGroupId,
        String noteId,
        List<String> sourceNoteIds
    ) {
    }

    record ClusterInheritanceResult(
        boolean inherited,
        String noteId,
        String clusterId,
        String clusterJobId
    ) {
    }
}
