package com.brainx.intelligence.infrastructure.events;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.infrastructure.events.producer.KafkaIntelligenceEventAdapter;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;

@Component
@ConditionalOnMissingBean(KafkaIntelligenceEventAdapter.class)
public class NoOpIntelligenceEventAdapter implements ExplorationEventPort, TokenUsagePort, AssistEventPort, ChatEventPort, ConnectionEventPort, ClusteringEventPort, InsightEventPort, OrganizationEventPort {

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

    @Override
    public void linkSuggestionCreated(LinkSuggestionCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void bridgeConceptCreated(BridgeConceptCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void folderOrganizationProposalCreated(FolderOrganizationProposalCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void chatThreadCreated(ChatThreadCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void chatMessageCreated(ChatMessageCreatedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void clusterJobRequested(ClusterJobRequestedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void clusterJobCompleted(ClusterJobCompletedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void insightReportRequested(InsightReportRequestedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }

    @Override
    public void insightReportCompleted(InsightReportCompletedEvent event) {
        // Keeps local/test runs runnable when event producer is disabled.
    }
}
