package com.brainx.intelligence.infrastructure.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

class ExternalSearchConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(ExternalSearchConfiguration.class)
        .withBean(TokenUsagePort.class, FakeTokenUsagePort::new)
        .withBean(AiTokenUsageCostEstimator.class, () -> new AiTokenUsageCostEstimator(new FakeAiModelCatalog()));

    @Test
    void registersNoOpWhenProviderIsNone() {
        contextRunner
            .withPropertyValues("brainx.external-search.provider=none")
            .run(context -> {
                assertThat(context).hasSingleBean(ExternalSearchPort.class);
                assertThat(context.getBean(ExternalSearchPort.class)).isInstanceOf(NoOpExternalSearchAdapter.class);
            });
    }

    @Test
    void registersNoOpWhenOpenAiProviderHasNoApiKey() {
        contextRunner
            .withPropertyValues(
                "brainx.external-search.provider=openai",
                "brainx.external-search.openai.api-key="
            )
            .run(context -> {
                assertThat(context).hasSingleBean(ExternalSearchPort.class);
                assertThat(context.getBean(ExternalSearchPort.class)).isInstanceOf(NoOpExternalSearchAdapter.class);
            });
    }

    @Test
    void registersOpenAiAdapterWhenProviderHasApiKey() {
        contextRunner
            .withPropertyValues(
                "brainx.external-search.provider=openai",
                "brainx.external-search.openai.api-key=test-api-key",
                "brainx.external-search.openai.base-url=https://api.openai.test",
                "brainx.external-search.openai.model=gpt-test"
            )
            .run(context -> {
                assertThat(context).hasSingleBean(ExternalSearchPort.class);
                assertThat(context.getBean(ExternalSearchPort.class)).isInstanceOf(OpenAiExternalSearchAdapter.class);
            });
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
        }
    }

    private static final class FakeAiModelCatalog implements AiModelCatalogPort {

        @Override
        public List<AiModel> findAll() {
            return List.of();
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return false;
        }
    }
}
