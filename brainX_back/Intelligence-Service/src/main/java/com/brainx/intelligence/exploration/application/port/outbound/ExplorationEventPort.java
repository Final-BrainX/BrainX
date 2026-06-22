package com.brainx.intelligence.exploration.application.port.outbound;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public interface ExplorationEventPort {

    void semanticSearchPerformed(SemanticSearchPerformedEvent event);

    record SemanticSearchPerformedEvent(
        String userId,
        String documentGroupId,
        String queryHash,
        int resultCount,
        boolean charged
    ) {
        public SemanticSearchPerformedEvent(
            String userId,
            String queryHash,
            int resultCount,
            boolean charged
        ) {
            this(userId, null, queryHash, resultCount, charged);
        }

        public SemanticSearchPerformedEvent {
            documentGroupId = DocumentGroups.normalize(documentGroupId);
        }
    }
}
