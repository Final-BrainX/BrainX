package com.brainx.intelligence.infrastructure.events;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.infrastructure.events.producer.KafkaIntelligenceEventAdapter;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;

@Component
@ConditionalOnMissingBean(KafkaIntelligenceEventAdapter.class)
public class NoOpIntelligenceEventAdapter implements ExplorationEventPort, TokenUsagePort, AssistEventPort {

    @Override
    public void semanticSearchPerformed(SemanticSearchPerformedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void recordTokenUsage(TokenUsageRecord record) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void aiSuggestionCreated(AiSuggestionCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void aiSuggestionDecisionRecorded(AiSuggestionDecisionRecordedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }
}
