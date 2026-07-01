package com.brainx.intelligence.shared.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingResponse;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;

class AiUsageRecorderTest {

    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeAiModelCatalog catalog = new FakeAiModelCatalog();
    private final AiUsageRecorder recorder = new AiUsageRecorder(
        tokenUsagePort,
        new AiTokenUsageCostEstimator(catalog)
    );

    @Test
    void recordsChatUsageWithCachedInputReasoningTokensAndCostEstimate() {
        catalog.model = new AiModel(
            "gpt-test",
            "GPT test",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.010000"),
                new BigDecimal("0.002000"),
                new BigDecimal("0.030000"),
                "usd"
            )
        );

        recorder.recordChatUsage(
            "user-1",
            "inline-assist-chat",
            "gpt-test",
            "suggestion-1",
            new AiTokenUsage(100, 20, 120, 40, 3)
        );

        assertThat(tokenUsagePort.records).hasSize(1);
        TokenUsageRecord record = tokenUsagePort.records.getFirst();
        assertThat(record.sourceService()).isEqualTo("Intelligence-Service");
        assertThat(record.featureId()).isEqualTo("inline-assist-chat");
        assertThat(record.inputTokens()).isEqualTo(100);
        assertThat(record.cachedInputTokens()).isEqualTo(40);
        assertThat(record.billableInputTokens()).isEqualTo(60);
        assertThat(record.outputTokens()).isEqualTo(20);
        assertThat(record.reasoningTokens()).isEqualTo(3);
        assertThat(record.totalTokens()).isEqualTo(120);
        assertThat(record.estimatedCost()).isEqualByComparingTo("0.001280000000");
        assertThat(record.costCurrency()).isEqualTo("USD");
        assertThat(record.causationId()).isEqualTo("suggestion-1");
    }

    @Test
    void recordsEmbeddingUsageAsInputTokens() {
        catalog.model = new AiModel(
            "voyage-4-lite",
            "Voyage 4 Lite",
            "voyage",
            new VendorTokenCost(new BigDecimal("0.000020"), null, null, "USD")
        );

        recorder.recordEmbeddingUsage(
            "user-1",
            "note-search-query-embedding",
            "query-1",
            new AiEmbeddingResponse("voyage-4-lite", 10, List.of())
        );

        assertThat(tokenUsagePort.records).hasSize(1);
        TokenUsageRecord record = tokenUsagePort.records.getFirst();
        assertThat(record.inputTokens()).isEqualTo(10);
        assertThat(record.billableInputTokens()).isEqualTo(10);
        assertThat(record.outputTokens()).isZero();
        assertThat(record.totalTokens()).isEqualTo(10);
        assertThat(record.estimatedCost()).isEqualByComparingTo("0.0000002");
        assertThat(record.causationId()).isEqualTo("query-1");
    }

    @Test
    void skipsWhenProviderUsageIsUnknown() {
        recorder.recordChatUsage("user-1", "feature", "model", "cause", new AiTokenUsage(null, null, null));
        recorder.recordEmbeddingUsage("user-1", "feature", "cause", new AiEmbeddingResponse("model", null, List.of()));
        recorder.recordRawUsage("user-1", "feature", "model", "cause", null, null, null, null, null);

        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void recordsTokensWithUnknownCostWhenModelIsMissingFromCatalog() {
        recorder.recordChatUsage(
            "user-1",
            "feature",
            "missing-model",
            "cause",
            new AiTokenUsage(10, 5, 15)
        );

        assertThat(tokenUsagePort.records).hasSize(1);
        TokenUsageRecord record = tokenUsagePort.records.getFirst();
        assertThat(record.totalTokens()).isEqualTo(15);
        assertThat(record.estimatedCost()).isNull();
        assertThat(record.costCurrency()).isNull();
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {
        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalog implements AiModelCatalogPort {
        private AiModel model;

        @Override
        public List<AiModel> findAll() {
            return model == null ? List.of() : List.of(model);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return model != null && model.modelId().equals(modelId)
                ? Optional.of(model)
                : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return model != null && model.modelId().equals(modelId);
        }
    }
}
