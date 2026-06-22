package com.brainx.intelligence.infrastructure.events.producer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;

import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionCreatedEvent;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionDecisionRecordedEvent;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort.SemanticSearchPerformedEvent;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.fasterxml.jackson.databind.ObjectMapper;

class KafkaIntelligenceEventAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final BrainxEventProducerProperties properties = properties();

    @Test
    void recordTokenUsagePublishesTokenUsageRecordedRequestedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.recordTokenUsage(new TokenUsageRecord(
            "usage-1",
            "user-1",
            "AI-Service",
            "sample-rag-chat",
            "gpt-test",
            100,
            40,
            60,
            20,
            5,
            120,
            new BigDecimal("0.0006"),
            new BigDecimal("0.00008"),
            new BigDecimal("0.0006"),
            new BigDecimal("0.00128"),
            "usd",
            "cause-1"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("token-usage-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("TokenUsageRecordedRequested");
        assertThat(root.get("eventVersion").asInt()).isEqualTo(1);
        assertThat(root.get("producer").asText()).isEqualTo("AI-Service");
        assertThat(root.get("correlationId").asText()).isEqualTo("cause-1");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("usage-1");
        assertThat(root.get("payload").get("cachedInputTokens").asInt()).isEqualTo(40);
        assertThat(root.get("payload").get("billableInputTokens").asInt()).isEqualTo(60);
        assertThat(root.get("payload").get("reasoningTokens").asInt()).isEqualTo(5);
        assertThat(root.get("payload").get("costCurrency").asText()).isEqualTo("USD");
    }

    @Test
    void semanticSearchPerformedPublishesSemanticSearchEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.semanticSearchPerformed(new SemanticSearchPerformedEvent(
            "user-1",
            "group-1",
            "hash",
            3,
            true
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("semantic-search-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("SemanticSearchPerformed");
        assertThat(root.get("payload").get("documentGroupId").asText()).isEqualTo("group-1");
        assertThat(root.get("payload").get("queryHash").asText()).isEqualTo("hash");
        assertThat(root.get("payload").get("resultCount").asInt()).isEqualTo(3);
        assertThat(root.get("payload").get("charged").asBoolean()).isTrue();
    }

    @Test
    void aiSuggestionCreatedPublishesAiSuggestionCreatedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.aiSuggestionCreated(new AiSuggestionCreatedEvent(
            "user-1",
            "suggestion-1",
            "inline-assist-chat",
            "note-1",
            "gpt-test"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("ai-suggestion-created-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("AiSuggestionCreated");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("suggestion-1");
        assertThat(root.get("payload").get("featureId").asText()).isEqualTo("inline-assist-chat");
        assertThat(root.get("payload").get("noteId").asText()).isEqualTo("note-1");
        assertThat(root.get("payload").get("modelId").asText()).isEqualTo("gpt-test");
    }

    @Test
    void aiSuggestionDecisionRecordedPublishesAiSuggestionDecisionRecordedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.aiSuggestionDecisionRecorded(new AiSuggestionDecisionRecordedEvent(
            "user-1",
            "suggestion-1",
            AiSuggestionDecision.REGENERATED,
            null
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("ai-suggestion-decision-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("AiSuggestionDecisionRecorded");
        assertThat(root.get("correlationId").asText()).isEqualTo("suggestion-1");
        assertThat(root.get("causationId").asText()).isEqualTo("suggestion-1");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("suggestion-1:REGENERATED");
        assertThat(root.get("payload").get("decision").asText()).isEqualTo("REGENERATED");
        assertThat(root.get("payload").get("appliedNoteId").isNull()).isTrue();
    }

    private static BrainxEventProducerProperties properties() {
        BrainxEventProducerProperties properties = new BrainxEventProducerProperties();
        properties.setSemanticSearchPerformedTopic("semantic-search-topic");
        properties.setTokenUsageRecordedRequestedTopic("token-usage-topic");
        properties.setAiSuggestionCreatedTopic("ai-suggestion-created-topic");
        properties.setAiSuggestionDecisionRecordedTopic("ai-suggestion-decision-topic");
        return properties;
    }

    @SuppressWarnings("unchecked")
    private static KafkaTemplate<String, String> kafkaTemplate() {
        return mock(KafkaTemplate.class);
    }
}
