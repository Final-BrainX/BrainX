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
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.events.producer", name = "enabled", havingValue = "true")
public class KafkaIntelligenceEventAdapter implements ExplorationEventPort, TokenUsagePort, AssistEventPort {

    private static final String PRODUCER = "AI-Service";
    private static final int EVENT_VERSION = 1;
    private static final String SEMANTIC_SEARCH_PERFORMED = "SemanticSearchPerformed";
    private static final String TOKEN_USAGE_RECORDED_REQUESTED = "TokenUsageRecordedRequested";
    private static final String AI_SUGGESTION_CREATED = "AiSuggestionCreated";
    private static final String AI_SUGGESTION_DECISION_RECORDED = "AiSuggestionDecisionRecorded";

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
        payload.put("documentGroupId", DocumentGroups.normalize(event.documentGroupId()));
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
