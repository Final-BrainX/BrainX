package com.brainx.gateway.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.gateway.config.HttpClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(GatewayDnsProperties.class)
public class GatewayHttpClientConfig {

    @Bean
    public HttpClientCustomizer gatewayDnsHttpClientCustomizer(GatewayDnsProperties dnsProperties) {
        return httpClient -> httpClient.resolver(spec -> spec
                .queryTimeout(dnsProperties.getQueryTimeout())
                .cacheMaxTimeToLive(dnsProperties.getCacheMaxTtl())
                .cacheMinTimeToLive(dnsProperties.getCacheMinTtl())
                .cacheNegativeTimeToLive(dnsProperties.getCacheNegativeTtl())
                .maxQueriesPerResolve(dnsProperties.getMaxQueriesPerResolve())
                .ndots(dnsProperties.getNdots())
                .retryTcpOnTimeout(dnsProperties.isRetryTcpOnTimeout()));
    }
}
