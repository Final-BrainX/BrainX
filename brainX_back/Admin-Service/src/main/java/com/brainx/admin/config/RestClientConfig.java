package com.brainx.admin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
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
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }

    @Bean
    public RestClient userRestClient(RestClient.Builder loadBalancedRestClientBuilder) {
        return loadBalancedRestClientBuilder
                .baseUrl(userServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient commerceRestClient(RestClient.Builder loadBalancedRestClientBuilder) {
        return loadBalancedRestClientBuilder
                .baseUrl(commerceServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient workspaceRestClient(RestClient.Builder loadBalancedRestClientBuilder) {
        return loadBalancedRestClientBuilder
                .baseUrl(workspaceServiceUrl)
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }

    @Bean
    public RestClient defaultRestClient(RestClient.Builder loadBalancedRestClientBuilder) {
        return loadBalancedRestClientBuilder
                .defaultHeader("X-Service-Token", serviceToken)
                .build();
    }
}
