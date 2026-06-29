package com.brainx.admin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Value("${brainx.service-token}")
    private String serviceToken;

    @Value("${brainx.services.gateway-service-url}")
    private String gatewayServiceUrl;

    @Bean
    public RestClient userRestClient() {
        return RestClient.builder()
                .baseUrl(gatewayServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient commerceRestClient() {
        return RestClient.builder()
                .baseUrl(gatewayServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient workspaceRestClient() {
        return RestClient.builder()
                .baseUrl(gatewayServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient defaultRestClient() {
        return RestClient.builder()
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }
}
