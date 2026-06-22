package com.brainx.intelligence.infrastructure.ai.voyage;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort;

class VoyageEmbeddingConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(VoyageEmbeddingConfiguration.class);

    @Test
    void doesNotRegisterEmbeddingPortWhenProviderIsNone() {
        contextRunner
            .withPropertyValues("brainx.ai.embedding.provider=none")
            .run(context -> assertThat(context).doesNotHaveBean(AiEmbeddingPort.class));
    }

    @Test
    void registersEmbeddingPortWhenVoyageProviderHasApiKey() {
        contextRunner
            .withPropertyValues(
                "brainx.ai.embedding.provider=voyage",
                "brainx.ai.embedding.voyage.api-key=test-api-key",
                "brainx.ai.embedding.voyage.base-url=https://api.voyageai.test",
                "brainx.ai.embedding.voyage.model=voyage-4-lite",
                "brainx.ai.embedding.voyage.dimensions=1024"
            )
            .run(context -> {
                assertThat(context).hasSingleBean(AiEmbeddingPort.class);
                assertThat(context.getBean(AiEmbeddingPort.class)).isInstanceOf(VoyageEmbeddingAdapter.class);
            });
    }

    @Test
    void failsFastWhenVoyageProviderHasNoApiKey() {
        contextRunner
            .withPropertyValues(
                "brainx.ai.embedding.provider=voyage",
                "brainx.ai.embedding.voyage.api-key="
            )
            .run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure()).hasMessageContaining("VOYAGE_API_KEY");
            });
    }
}
