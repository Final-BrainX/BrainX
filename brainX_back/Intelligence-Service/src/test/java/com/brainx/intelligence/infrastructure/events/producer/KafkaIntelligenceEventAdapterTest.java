package com.brainx.intelligence.infrastructure.events.producer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;

import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionCreatedEvent;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionDecisionRecordedEvent;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort.ChatMessageCreatedEvent;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort.ChatThreadCreatedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobCompletedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobRequestedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.BridgeConceptCreatedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.LinkSuggestionCreatedEvent;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort.SemanticSearchPerformedEvent;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportCompletedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportRequestedEvent;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort.FolderOrganizationProposalCreatedEvent;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.fasterxml.jackson.databind.ObjectMapper;

class KafkaIntelligenceEventAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final BrainxEventProducerProperties properties = properties();

    @Test
    void brokerAcknowledgementFailureIsPropagated() {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
            .thenReturn(CompletableFuture.failedFuture(new RuntimeException("broker unavailable")));
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        assertThatThrownBy(() -> adapter.clusterJobRequested(
            new ClusterJobRequestedEvent("user-1", "job-1", java.util.Map.of(), java.util.Map.of())
        ))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ClusterJobRequested");
    }

    @Test
    void recordTokenUsagePublishesTokenUsageRecordedRequestedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.recordTokenUsage(new TokenUsageRecord(
            "usage-1",
            "user-1",
            "Intelligence-Service",
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
        assertThat(root.get("producer").asText()).isEqualTo("Intelligence-Service");
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
        assertThat(root.get("payload").get("scope").asText()).isEqualTo("DOCUMENT_GROUP");
        assertThat(root.get("payload").get("documentGroupId").asText()).isEqualTo("group-1");
        assertThat(root.get("payload").get("queryHash").asText()).isEqualTo("hash");
        assertThat(root.get("payload").get("resultCount").asInt()).isEqualTo(3);
        assertThat(root.get("payload").get("charged").asBoolean()).isTrue();
    }

    @Test
    void semanticSearchPerformedPublishesUserScopeWithoutDocumentGroup() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.semanticSearchPerformed(new SemanticSearchPerformedEvent(
            "user-1",
            SearchScope.USER,
            null,
            "hash",
            2,
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
        assertThat(root.get("payload").get("scope").asText()).isEqualTo("USER");
        assertThat(root.get("payload").get("documentGroupId").isNull()).isTrue();
        assertThat(root.get("payload").get("queryHash").asText()).isEqualTo("hash");
        assertThat(root.get("payload").get("resultCount").asInt()).isEqualTo(2);
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
    void aiSuggestionCreatedPublishesLinkSuggestionFeaturePayload() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.linkSuggestionCreated(new LinkSuggestionCreatedEvent(
            "user-1",
            "link-suggestion-1",
            "link-suggestions",
            "note-1",
            "gpt-link"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("ai-suggestion-created-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("AiSuggestionCreated");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("link-suggestion-1");
        assertThat(root.get("payload").get("featureId").asText()).isEqualTo("link-suggestions");
        assertThat(root.get("payload").get("noteId").asText()).isEqualTo("note-1");
        assertThat(root.get("payload").get("modelId").asText()).isEqualTo("gpt-link");
    }

    @Test
    void aiSuggestionCreatedPublishesBridgeConceptFeaturePayload() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.bridgeConceptCreated(new BridgeConceptCreatedEvent(
            "user-1",
            "bridge-abc123",
            "bridge-concepts",
            null,
            "gpt-bridge"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("ai-suggestion-created-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("AiSuggestionCreated");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("bridge-abc123");
        assertThat(root.get("payload").get("suggestionId").asText()).isEqualTo("bridge-abc123");
        assertThat(root.get("payload").get("featureId").asText()).isEqualTo("bridge-concepts");
        assertThat(root.get("payload").get("noteId").isNull()).isTrue();
        assertThat(root.get("payload").get("modelId").asText()).isEqualTo("gpt-bridge");
    }

    @Test
    void aiSuggestionCreatedPublishesFolderOrganizationPayload() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.folderOrganizationProposalCreated(new FolderOrganizationProposalCreatedEvent(
            "user-1",
            "proposal-1",
            "folder-organization",
            null,
            "gpt-organization"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("ai-suggestion-created-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("AiSuggestionCreated");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("proposal-1");
        assertThat(root.get("payload").get("suggestionId").asText()).isEqualTo("proposal-1");
        assertThat(root.get("payload").get("featureId").asText()).isEqualTo("folder-organization");
        assertThat(root.get("payload").get("noteId").isNull()).isTrue();
        assertThat(root.get("payload").get("modelId").asText()).isEqualTo("gpt-organization");
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

    @Test
    void chatThreadCreatedPublishesChatThreadCreatedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.chatThreadCreated(new ChatThreadCreatedEvent(
            "user-1",
            "thread-1",
            "group-1",
            "gpt-test",
            "RAG 질문"
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("chat-thread-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("ChatThreadCreated");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("thread-1");
        assertThat(root.get("payload").get("threadId").asText()).isEqualTo("thread-1");
        assertThat(root.get("payload").get("documentGroupId").asText()).isEqualTo("group-1");
        assertThat(root.get("payload").get("modelId").asText()).isEqualTo("gpt-test");
        assertThat(root.get("payload").get("title").asText()).isEqualTo("RAG 질문");
    }

    @Test
    void chatMessageCreatedPublishesChatMessageCreatedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.chatMessageCreated(new ChatMessageCreatedEvent(
            "user-1",
            "thread-1",
            "message-1",
            "group-1",
            "gpt-test",
            30,
            12,
            java.util.List.of("note-1", "note-2")
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("chat-message-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("ChatMessageCreated");
        assertThat(root.get("correlationId").asText()).isEqualTo("thread-1");
        assertThat(root.get("causationId").asText()).isEqualTo("thread-1");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("message-1");
        assertThat(root.get("payload").get("messageId").asText()).isEqualTo("message-1");
        assertThat(root.get("payload").get("inputTokens").asInt()).isEqualTo(30);
        assertThat(root.get("payload").get("outputTokens").asInt()).isEqualTo(12);
        assertThat(root.get("payload").get("citationNoteIds")).hasSize(2);
    }

    @Test
    void clusterJobRequestedPublishesClusterJobRequestedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.clusterJobRequested(new ClusterJobRequestedEvent(
            "user-1",
            "job-1",
            java.util.Map.of("documentGroupId", "group-1"),
            java.util.Map.of("maxClusters", 3)
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("cluster-job-requested-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("ClusterJobRequested");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("job-1");
        assertThat(root.get("payload").get("clusterJobId").asText()).isEqualTo("job-1");
        assertThat(root.get("payload").get("scope").get("documentGroupId").asText()).isEqualTo("group-1");
        assertThat(root.get("payload").get("algorithmOptions").get("maxClusters").asInt()).isEqualTo(3);
    }

    @Test
    void clusterJobCompletedPublishesClusterJobCompletedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.clusterJobCompleted(new ClusterJobCompletedEvent("user-1", "job-1", 2));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("cluster-job-completed-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("ClusterJobCompleted");
        assertThat(root.get("causationId").asText()).isEqualTo("job-1");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("job-1:completed");
        assertThat(root.get("payload").get("clusterCount").asInt()).isEqualTo(2);
    }

    @Test
    void insightReportRequestedPublishesInsightReportRequestedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.insightReportRequested(new InsightReportRequestedEvent(
            "user-1",
            "report-1",
            java.util.Map.of("documentGroupId", "group-1"),
            true
        ));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("insight-report-requested-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("InsightReportRequested");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("report-1");
        assertThat(root.get("payload").get("reportJobId").asText()).isEqualTo("report-1");
        assertThat(root.get("payload").get("scope").get("documentGroupId").asText()).isEqualTo("group-1");
        assertThat(root.get("payload").get("includeLearningRecommendations").asBoolean()).isTrue();
    }

    @Test
    void insightReportCompletedPublishesInsightReportCompletedEnvelope() throws Exception {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        var adapter = new KafkaIntelligenceEventAdapter(kafkaTemplate, objectMapper, properties);

        adapter.insightReportCompleted(new InsightReportCompletedEvent("user-1", "report-1", 3, 4));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(
            eq("insight-report-completed-topic"),
            eq("user-1"),
            payload.capture()
        );
        var root = objectMapper.readTree(payload.getValue());

        assertThat(root.get("eventType").asText()).isEqualTo("InsightReportCompleted");
        assertThat(root.get("causationId").asText()).isEqualTo("report-1");
        assertThat(root.get("idempotencyKey").asText()).isEqualTo("report-1:completed");
        assertThat(root.get("payload").get("knowledgeGapCount").asInt()).isEqualTo(3);
        assertThat(root.get("payload").get("recommendationCount").asInt()).isEqualTo(4);
    }

    private static BrainxEventProducerProperties properties() {
        BrainxEventProducerProperties properties = new BrainxEventProducerProperties();
        properties.setSemanticSearchPerformedTopic("semantic-search-topic");
        properties.setTokenUsageRecordedRequestedTopic("token-usage-topic");
        properties.setAiSuggestionCreatedTopic("ai-suggestion-created-topic");
        properties.setAiSuggestionDecisionRecordedTopic("ai-suggestion-decision-topic");
        properties.setChatThreadCreatedTopic("chat-thread-topic");
        properties.setChatMessageCreatedTopic("chat-message-topic");
        properties.setClusterJobRequestedTopic("cluster-job-requested-topic");
        properties.setClusterJobCompletedTopic("cluster-job-completed-topic");
        properties.setInsightReportRequestedTopic("insight-report-requested-topic");
        properties.setInsightReportCompletedTopic("insight-report-completed-topic");
        return properties;
    }

    @SuppressWarnings("unchecked")
    private static KafkaTemplate<String, String> kafkaTemplate() {
        KafkaTemplate<String, String> template = mock(KafkaTemplate.class);
        when(template.send(anyString(), anyString(), anyString()))
            .thenReturn(CompletableFuture.completedFuture(null));
        return template;
    }
}
