package com.brainx.admin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Value("${brainx.service-token}")
    private String serviceToken;

    @Value("${brainx.services.user-service-url}")
    private String userServiceUrl;

    @Value("${brainx.services.commerce-service-url}")
    private String commerceServiceUrl;

    @Value("${brainx.services.workspace-service-url}")
    private String workspaceServiceUrl;

    @Bean
    public RestClient userRestClient() {
        return RestClient.builder()
                .baseUrl(userServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient commerceRestClient() {
        return RestClient.builder()
                .baseUrl(commerceServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient workspaceRestClient() {
        return RestClient.builder()
                .baseUrl(workspaceServiceUrl)
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
