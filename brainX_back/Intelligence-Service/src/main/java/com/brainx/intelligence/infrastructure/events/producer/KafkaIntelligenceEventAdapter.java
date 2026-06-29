package com.brainx.intelligence.infrastructure.events.producer;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.events.producer", name = "enabled", havingValue = "true")
public class KafkaIntelligenceEventAdapter implements ExplorationEventPort, TokenUsagePort, AssistEventPort, ChatEventPort, ConnectionEventPort, ClusteringEventPort, InsightEventPort, OrganizationEventPort {

    private static final String PRODUCER = "AI-Service";
    private static final int EVENT_VERSION = 1;
    private static final String SEMANTIC_SEARCH_PERFORMED = "SemanticSearchPerformed";
    private static final String TOKEN_USAGE_RECORDED_REQUESTED = "TokenUsageRecordedRequested";
    private static final String AI_SUGGESTION_CREATED = "AiSuggestionCreated";
    private static final String AI_SUGGESTION_DECISION_RECORDED = "AiSuggestionDecisionRecorded";
    private static final String CHAT_THREAD_CREATED = "ChatThreadCreated";
    private static final String CHAT_MESSAGE_CREATED = "ChatMessageCreated";
    private static final String CLUSTER_JOB_REQUESTED = "ClusterJobRequested";
    private static final String CLUSTER_JOB_COMPLETED = "ClusterJobCompleted";
    private static final String INSIGHT_REPORT_REQUESTED = "InsightReportRequested";
    private static final String INSIGHT_REPORT_COMPLETED = "InsightReportCompleted";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final BrainxEventProducerProperties properties;

    public KafkaIntelligenceEventAdapter(
        KafkaTemplate<String, String> kafkaTemplate,
        ObjectMapper objectMapper,
        BrainxEventProducerProperties properties
    ) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public void semanticSearchPerformed(SemanticSearchPerformedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("scope", event.scope().name());
        payload.put("documentGroupId", event.scope() == SearchScope.USER
            ? null
            : DocumentGroups.normalize(event.documentGroupId()));
        payload.put("queryHash", event.queryHash());
        payload.put("resultCount", event.resultCount());
        payload.put("charged", event.charged());
        publish(
            properties.getSemanticSearchPerformedTopic(),
            event.userId(),
            SEMANTIC_SEARCH_PERFORMED,
            event.userId(),
            null,
            null,
            payload
        );
    }

    @Override
    public void recordTokenUsage(TokenUsageRecord record) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("usageRequestId", record.usageRequestId());
        payload.put("userId", record.userId());
        payload.put("sourceService", record.sourceService());
        payload.put("featureId", record.featureId());
        payload.put("modelId", record.modelId());
        payload.put("inputTokens", record.inputTokens());
        payload.put("cachedInputTokens", record.cachedInputTokens());
        payload.put("billableInputTokens", record.billableInputTokens());
        payload.put("outputTokens", record.outputTokens());
        payload.put("reasoningTokens", record.reasoningTokens());
        payload.put("totalTokens", record.totalTokens());
        payload.put("estimatedInputCost", record.estimatedInputCost());
        payload.put("estimatedCachedInputCost", record.estimatedCachedInputCost());
        payload.put("estimatedOutputCost", record.estimatedOutputCost());
        payload.put("estimatedCost", record.estimatedCost());
        payload.put("costCurrency", record.costCurrency());
        payload.put("causationId", record.causationId());
        publish(
            properties.getTokenUsageRecordedRequestedTopic(),
            record.userId(),
            TOKEN_USAGE_RECORDED_REQUESTED,
            record.userId(),
            record.causationId(),
            record.usageRequestId(),
            payload
        );
    }

    @Override
    public void aiSuggestionCreated(AiSuggestionCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("suggestionId", event.suggestionId());
        payload.put("featureId", event.featureId());
        payload.put("noteId", event.noteId());
        payload.put("modelId", event.modelId());
        publish(
            properties.getAiSuggestionCreatedTopic(),
            event.userId(),
            AI_SUGGESTION_CREATED,
            event.userId(),
            null,
            event.suggestionId(),
            payload
        );
    }

    @Override
    public void linkSuggestionCreated(LinkSuggestionCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("suggestionId", event.suggestionId());
        payload.put("featureId", event.featureId());
        payload.put("noteId", event.noteId());
        payload.put("modelId", event.modelId());
        publish(
            properties.getAiSuggestionCreatedTopic(),
            event.userId(),
            AI_SUGGESTION_CREATED,
            event.userId(),
            null,
            event.suggestionId(),
            payload
        );
    }

    @Override
    public void bridgeConceptCreated(BridgeConceptCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("suggestionId", event.suggestionId());
        payload.put("featureId", event.featureId());
        payload.put("noteId", event.noteId());
        payload.put("modelId", event.modelId());
        publish(
            properties.getAiSuggestionCreatedTopic(),
            event.userId(),
            AI_SUGGESTION_CREATED,
            event.userId(),
            null,
            event.suggestionId(),
            payload
        );
    }

    @Override
    public void folderOrganizationProposalCreated(FolderOrganizationProposalCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("suggestionId", event.suggestionId());
        payload.put("featureId", event.featureId());
        payload.put("noteId", event.noteId());
        payload.put("modelId", event.modelId());
        publish(
            properties.getAiSuggestionCreatedTopic(),
            event.userId(),
            AI_SUGGESTION_CREATED,
            event.userId(),
            null,
            event.suggestionId(),
            payload
        );
    }

    @Override
    public void aiSuggestionDecisionRecorded(AiSuggestionDecisionRecordedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("suggestionId", event.suggestionId());
        payload.put("decision", event.decision());
        payload.put("appliedNoteId", event.appliedNoteId());
        publish(
            properties.getAiSuggestionDecisionRecordedTopic(),
            event.userId(),
            AI_SUGGESTION_DECISION_RECORDED,
            event.userId(),
            event.suggestionId(),
            event.suggestionId() + ":" + event.decision().name(),
            payload
        );
    }

    @Override
    public void chatThreadCreated(ChatThreadCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("threadId", event.threadId());
        payload.put("userId", event.userId());
        payload.put("documentGroupId", DocumentGroups.normalize(event.documentGroupId()));
        payload.put("modelId", event.modelId());
        payload.put("title", event.title());
        publish(
            properties.getChatThreadCreatedTopic(),
            event.userId(),
            CHAT_THREAD_CREATED,
            event.userId(),
            null,
            event.threadId(),
            payload
        );
    }

    @Override
    public void chatMessageCreated(ChatMessageCreatedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("threadId", event.threadId());
        payload.put("messageId", event.messageId());
        payload.put("userId", event.userId());
        payload.put("documentGroupId", DocumentGroups.normalize(event.documentGroupId()));
        payload.put("modelId", event.modelId());
        payload.put("inputTokens", event.inputTokens());
        payload.put("outputTokens", event.outputTokens());
        payload.put("citationNoteIds", event.citationNoteIds());
        publish(
            properties.getChatMessageCreatedTopic(),
            event.userId(),
            CHAT_MESSAGE_CREATED,
            event.userId(),
            event.threadId(),
            event.messageId(),
            payload
        );
    }

    @Override
    public void clusterJobRequested(ClusterJobRequestedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("clusterJobId", event.clusterJobId());
        payload.put("scope", event.scope());
        payload.put("algorithmOptions", event.algorithmOptions());
        publish(
            properties.getClusterJobRequestedTopic(),
            event.userId(),
            CLUSTER_JOB_REQUESTED,
            event.userId(),
            null,
            event.clusterJobId(),
            payload
        );
    }

    @Override
    public void clusterJobCompleted(ClusterJobCompletedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("clusterJobId", event.clusterJobId());
        payload.put("clusterCount", event.clusterCount());
        publish(
            properties.getClusterJobCompletedTopic(),
            event.userId(),
            CLUSTER_JOB_COMPLETED,
            event.userId(),
            event.clusterJobId(),
            event.clusterJobId() + ":completed",
            payload
        );
    }

    @Override
    public void insightReportRequested(InsightReportRequestedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("reportId", event.reportId());
        payload.put("scope", event.scope());
        payload.put("includeLearningRecommendations", event.includeLearningRecommendations());
        publish(
            properties.getInsightReportRequestedTopic(),
            event.userId(),
            INSIGHT_REPORT_REQUESTED,
            event.userId(),
            null,
            event.reportId(),
            payload
        );
    }

    @Override
    public void insightReportCompleted(InsightReportCompletedEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", event.userId());
        payload.put("reportId", event.reportId());
        payload.put("knowledgeGapCount", event.knowledgeGapCount());
        payload.put("recommendationCount", event.recommendationCount());
        publish(
            properties.getInsightReportCompletedTopic(),
            event.userId(),
            INSIGHT_REPORT_COMPLETED,
            event.userId(),
            event.reportId(),
            event.reportId() + ":completed",
            payload
        );
    }

    private void publish(
        String topic,
        String key,
        String eventType,
        String userId,
        String causationId,
        String idempotencyKey,
        Map<String, Object> payload
    ) {
        String eventId = UUID.randomUUID().toString();
        String correlationId = StringUtils.hasText(causationId) ? causationId : eventId;
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("occurredAt", Instant.now());
        envelope.put("producer", PRODUCER);
        envelope.put("tenantId", null);
        envelope.put("userId", userId);
        envelope.put("correlationId", correlationId);
        envelope.put("causationId", causationId);
        envelope.put("idempotencyKey", idempotencyKey);
        envelope.put("payload", payload);

        kafkaTemplate.send(topic, key, toJson(envelope));
    }

    private String toJson(Map<String, Object> envelope) {
        try {
            return objectMapper.writeValueAsString(envelope);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize BrainX event envelope.", exception);
        }
    }
}
