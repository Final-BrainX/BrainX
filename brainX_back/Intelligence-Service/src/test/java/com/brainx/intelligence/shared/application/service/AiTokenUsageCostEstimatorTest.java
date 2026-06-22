package com.brainx.intelligence.shared.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;

class AiTokenUsageCostEstimatorTest {

    private final FakeAiModelCatalog catalog = new FakeAiModelCatalog();
    private final AiTokenUsageCostEstimator estimator = new AiTokenUsageCostEstimator(catalog);

    @Test
    void estimatesInputCachedInputAndOutputCostSeparately() {
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

        var estimate = estimator.estimate("gpt-test", 100, 40, 20);

        assertThat(estimate.inputCost()).isEqualByComparingTo("0.000600000000");
        assertThat(estimate.cachedInputCost()).isEqualByComparingTo("0.000080000000");
        assertThat(estimate.outputCost()).isEqualByComparingTo("0.000600000000");
        assertThat(estimate.totalCost()).isEqualByComparingTo("0.001280000000");
        assertThat(estimate.currencyCode()).isEqualTo("USD");
    }

    @Test
    void returnsUnknownWhenModelIsMissing() {
        var estimate = estimator.estimate("missing", 100, 0, 20);

        assertThat(estimate.totalCost()).isNull();
        assertThat(estimate.currencyCode()).isNull();
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
