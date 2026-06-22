package com.brainx.intelligence.infrastructure.vector.qdrant;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;

@Configuration
@EnableConfigurationProperties(QdrantVectorIndexProperties.class)
public class QdrantVectorIndexConfiguration {

    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(prefix = "brainx.vector.qdrant", name = "enabled", havingValue = "true", matchIfMissing = true)
    QdrantClient qdrantClient(QdrantVectorIndexProperties properties) {
        QdrantGrpcClient.Builder builder = QdrantGrpcClient.newBuilder(
            properties.getHost(),
            properties.getPort(),
            properties.isUseTls(),
            false
        ).withTimeout(properties.getTimeout());
        if (StringUtils.hasText(properties.getApiKey())) {
            builder.withApiKey(properties.getApiKey());
        }
        return new QdrantClient(builder.build());
    }

    @Bean
    @ConditionalOnProperty(prefix = "brainx.vector.qdrant", name = "enabled", havingValue = "true", matchIfMissing = true)
    QdrantVectorIndexClient qdrantVectorIndexClient(
        QdrantClient qdrantClient,
        QdrantVectorIndexProperties properties
    ) {
        return new DefaultQdrantVectorIndexClient(qdrantClient, properties);
    }
}
