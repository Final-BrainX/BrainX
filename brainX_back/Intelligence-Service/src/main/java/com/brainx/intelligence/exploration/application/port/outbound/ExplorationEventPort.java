package com.brainx.intelligence.exploration.application.port.outbound;

public interface ExplorationEventPort {

    void semanticSearchPerformed(SemanticSearchPerformedEvent event);

    record SemanticSearchPerformedEvent(
        String userId,
        String queryHash,
        int resultCount,
        boolean charged
    ) {
    }
}
