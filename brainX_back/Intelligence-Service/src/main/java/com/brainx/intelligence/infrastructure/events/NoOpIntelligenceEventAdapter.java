package com.brainx.intelligence.infrastructure.events;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;

@Component
public class NoOpIntelligenceEventAdapter implements ExplorationEventPort, TokenUsagePort {

    @Override
    public void semanticSearchPerformed(SemanticSearchPerformedEvent event) {
        // Kafka publishing will be added when the messaging adapter is wired.
    }

    @Override
    public void recordTokenUsage(TokenUsageRecord record) {
        // Token usage is event-first; this no-op keeps the vertical slice locally runnable.
    }
}
