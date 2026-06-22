package com.brainx.intelligence.infrastructure.ai.voyage;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort;

@Configuration
@EnableConfigurationProperties(VoyageEmbeddingProperties.class)
public class VoyageEmbeddingConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "brainx.ai.embedding", name = "provider", havingValue = "voyage")
    AiEmbeddingPort voyageEmbeddingAdapter(VoyageEmbeddingProperties properties) {
        VoyageEmbeddingProperties.Voyage voyage = properties.getVoyage();
        if (!StringUtils.hasText(voyage.getApiKey())) {
            throw new IllegalStateException("VOYAGE_API_KEY must be set when BRAINX_AI_EMBEDDING_PROVIDER=voyage.");
        }
        if (!StringUtils.hasText(voyage.getModel())) {
            throw new IllegalStateException("VOYAGE_EMBEDDING_MODEL must not be blank.");
        }
        if (voyage.getDimensions() <= 0) {
            throw new IllegalStateException("VOYAGE_EMBEDDING_DIMENSIONS must be positive.");
        }

        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(voyage.getTimeout());
        requestFactory.setReadTimeout(voyage.getTimeout());

        RestClient restClient = RestClient.builder()
            .baseUrl(voyage.getBaseUrl().toString())
            .requestFactory(requestFactory)
            .build();

        return new VoyageEmbeddingAdapter(restClient, voyage);
    }
}
