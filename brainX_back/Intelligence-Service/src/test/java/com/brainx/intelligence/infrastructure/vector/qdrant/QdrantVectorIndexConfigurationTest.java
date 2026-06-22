package com.brainx.intelligence.infrastructure.vector.qdrant;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import io.qdrant.client.QdrantClient;

class QdrantVectorIndexConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(QdrantVectorIndexConfiguration.class);

    @Test
    void registersVectorIndexClientWhenQdrantIsEnabled() {
        contextRunner
            .withPropertyValues(
                "brainx.vector.qdrant.enabled=true",
                "brainx.vector.qdrant.host=localhost",
                "brainx.vector.qdrant.port=6334",
                "brainx.vector.qdrant.collection-name=brainx_note_search_voyage_1024"
            )
            .run(context -> {
                assertThat(context).hasSingleBean(QdrantClient.class);
                assertThat(context).hasSingleBean(QdrantVectorIndexClient.class);
                assertThat(context.getBean(QdrantVectorIndexClient.class))
                    .isInstanceOf(DefaultQdrantVectorIndexClient.class);
            });
    }

    @Test
    void doesNotRegisterVectorIndexClientWhenQdrantIsDisabled() {
        contextRunner
            .withPropertyValues("brainx.vector.qdrant.enabled=false")
            .run(context -> {
                assertThat(context).doesNotHaveBean(QdrantClient.class);
                assertThat(context).doesNotHaveBean(QdrantVectorIndexClient.class);
            });
    }
}
