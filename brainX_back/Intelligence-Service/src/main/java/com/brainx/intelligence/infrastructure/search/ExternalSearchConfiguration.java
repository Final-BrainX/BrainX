package com.brainx.intelligence.infrastructure.search;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

@Configuration
@EnableConfigurationProperties(ExternalSearchProperties.class)
public class ExternalSearchConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "brainx.external-search", name = "provider", havingValue = "openai")
    ExternalSearchPort openAiExternalSearchPort(
        ExternalSearchProperties properties,
        AiUsageRecorder aiUsageRecorder,
        AiTokenUsageCostEstimator usageCostEstimator
    ) {
        if (!StringUtils.hasText(properties.getOpenai().getApiKey())) {
            return new NoOpExternalSearchAdapter();
        }
        if (!StringUtils.hasText(properties.getOpenai().getModel())) {
            throw new IllegalStateException("OPENAI_WEB_SEARCH_MODEL must not be blank.");
        }

        WebClient webClient = WebClient.builder()
            .baseUrl(properties.getOpenai().getBaseUrl().toString())
            .build();

        return new OpenAiExternalSearchAdapter(
            webClient,
            properties,
            aiUsageRecorder,
            usageCostEstimator
        );
    }

    @Bean
    @ConditionalOnMissingBean(ExternalSearchPort.class)
    ExternalSearchPort noOpExternalSearchPort() {
        return new NoOpExternalSearchAdapter();
    }
}
