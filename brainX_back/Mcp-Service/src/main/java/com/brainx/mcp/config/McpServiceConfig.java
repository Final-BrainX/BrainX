package com.brainx.mcp.config;

import com.brainx.mcp.client.application.ApiKeyGenerator;
import com.brainx.mcp.client.application.ApiKeyParser;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpServiceConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    ApiKeyParser apiKeyParser(@Value("${brainx.mcp.api-key.prefix}") String prefix) {
        return new ApiKeyParser(prefix);
    }

    @Bean
    ApiKeyGenerator apiKeyGenerator() {
        return new ApiKeyGenerator();
    }
}
