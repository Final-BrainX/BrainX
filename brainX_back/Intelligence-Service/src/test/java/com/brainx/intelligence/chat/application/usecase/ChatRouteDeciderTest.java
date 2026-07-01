package com.brainx.intelligence.chat.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.chat.domain.ChatRoute;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class ChatRouteDeciderTest {

    private final ChatRouterProperties properties = new ChatRouterProperties();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final LlmChatRouteDecider decider = new LlmChatRouteDecider(
        properties,
        chatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new FakeAiModelCatalogPort())),
        new ObjectMapper().findAndRegisterModules()
    );

    @Test
    void routesValidJsonWithNanoModelAndRecordsUsage() {
        chatPort.response = new AiChatResponse(
            "{\"route\":\"WORKSPACE_SEARCH\",\"reason\":\"search across notes\"}",
            new AiTokenUsage(100, 8, 108, 20, 0)
        );

        var decision = decider.decide(new ChatRouteDecider.ChatRouteRequest(
            "user-1",
            "내 노트에서 인증 관련 내용을 찾아줘",
            "group-1",
            Map.of(),
            Map.of("source", "WORKSPACE_CHAT", "mode", "NONE", "items", List.of())
        ));

        assertThat(decision.route()).isEqualTo(ChatRoute.WORKSPACE_SEARCH);
        assertThat(decision.reason()).isEqualTo("search across notes");
        assertThat(decision.routerModel()).isEqualTo("gpt-5.4-nano");
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("gpt-5.4-nano");
        assertThat(chatPort.lastRequest.messages().getFirst().content()).contains("Return only strict JSON");
        assertThat(chatPort.lastRequest.messages().getFirst().content())
            .contains("current document group")
            .contains("내 전체 노트")
            .contains("WORKSPACE_SEARCH");
        assertThat(chatPort.lastRequest.messages().getLast().content()).contains("내 노트에서 인증 관련 내용");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("chat-router-classifier");
        assertThat(tokenUsagePort.records.getFirst().modelId()).isEqualTo("gpt-5.4-nano");
        assertThat(tokenUsagePort.records.getFirst().inputTokens()).isEqualTo(100);
        assertThat(tokenUsagePort.records.getFirst().cachedInputTokens()).isEqualTo(20);
        assertThat(tokenUsagePort.records.getFirst().billableInputTokens()).isEqualTo(80);
        assertThat(tokenUsagePort.records.getFirst().outputTokens()).isEqualTo(8);
        assertThat(tokenUsagePort.records.getFirst().estimatedCost()).isEqualByComparingTo("0.0000975");
    }

    @Test
    void invalidJsonFailsClosedToOutOfScope() {
        chatPort.response = new AiChatResponse("NOTE_QA", null);

        var decision = decider.decide(new ChatRouteDecider.ChatRouteRequest(
            "user-1",
            "RAG란?",
            "group-1",
            Map.of(),
            Map.of()
        ));

        assertThat(decision.route()).isEqualTo(ChatRoute.OUT_OF_SCOPE);
        assertThat(decision.reason()).isEqualTo("invalid router response");
    }

    @Test
    void providerFailureFailsClosedToOutOfScope() {
        chatPort.failure = new IllegalStateException("provider down");

        var decision = decider.decide(new ChatRouteDecider.ChatRouteRequest(
            "user-1",
            "RAG란?",
            "group-1",
            Map.of(),
            Map.of()
        ));

        assertThat(decision.route()).isEqualTo(ChatRoute.OUT_OF_SCOPE);
        assertThat(decision.reason()).isEqualTo("router failed");
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private AiChatRequest lastRequest;
        private AiChatResponse response = new AiChatResponse("{\"route\":\"NOTE_QA\",\"reason\":\"note question\"}", null);
        private RuntimeException failure;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            lastRequest = request;
            if (failure != null) {
                throw failure;
            }
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        private final List<TokenUsageRecord> records = new java.util.ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalogPort implements AiModelCatalogPort {

        private static final AiModel MODEL = new AiModel(
            "gpt-5.4-nano",
            "GPT-5.4 nano",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.000750"),
                new BigDecimal("0.000075"),
                new BigDecimal("0.004500"),
                "USD"
            )
        );

        @Override
        public List<AiModel> findAll() {
            return List.of(MODEL);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return MODEL.modelId().equals(modelId) ? Optional.of(MODEL) : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return MODEL.modelId().equals(modelId);
        }
    }
}
