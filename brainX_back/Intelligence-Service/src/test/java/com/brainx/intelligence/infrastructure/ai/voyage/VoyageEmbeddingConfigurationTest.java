package com.brainx.intelligence.infrastructure.ai.voyage;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class VoyageEmbeddingConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(VoyageEmbeddingConfiguration.class);

    @Test
    void doesNotRegisterEmbeddingModelWhenProviderIsNone() {
        contextRunner
            .withPropertyValues("brainx.ai.embedding.provider=none")
            .run(context -> assertThat(context).doesNotHaveBean(EmbeddingModel.class));
    }

    @Test
    void registersEmbeddingModelWhenVoyageProviderHasApiKey() {
        contextRunner
            .withPropertyValues(
                "brainx.ai.embedding.provider=voyage",
                "brainx.ai.embedding.voyage.api-key=test-api-key",
                "brainx.ai.embedding.voyage.base-url=https://api.voyageai.test",
                "brainx.ai.embedding.voyage.model=voyage-4-lite",
                "brainx.ai.embedding.voyage.dimensions=1024"
            )
            .run(context -> {
                assertThat(context).hasSingleBean(EmbeddingModel.class);
                assertThat(context.getBean(EmbeddingModel.class)).isInstanceOf(VoyageEmbeddingModel.class);
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
