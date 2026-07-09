package com.brainx.intelligence.infrastructure.search;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties(prefix = "brainx.external-search")
public class ExternalSearchProperties {

    private String provider = "none";
    private int maxSources = 8;
    private Duration timeout = Duration.ofSeconds(60);
    private String searchContextSize = "low";
    private OpenAi openai = new OpenAi();
    private static final Set<String> SEARCH_CONTEXT_SIZES = Set.of("low", "medium", "high");

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public int getMaxSources() {
        return maxSources;
    }

    public void setMaxSources(int maxSources) {
        this.maxSources = Math.max(1, maxSources);
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        if (timeout != null) {
            this.timeout = timeout;
        }
    }

    public String getSearchContextSize() {
        return normalizeSearchContextSize(searchContextSize);
    }

    public void setSearchContextSize(String searchContextSize) {
        this.searchContextSize = normalizeSearchContextSize(searchContextSize);
    }

    public OpenAi getOpenai() {
        return openai;
    }

    public void setOpenai(OpenAi openai) {
        this.openai = openai == null ? new OpenAi() : openai;
    }

    private static String normalizeSearchContextSize(String value) {
        if (!StringUtils.hasText(value)) {
            return "low";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return SEARCH_CONTEXT_SIZES.contains(normalized) ? normalized : "low";
    }

    public static class OpenAi {

        private String apiKey = "";
        private URI baseUrl = URI.create("https://api.openai.com");
        private String model = "gpt-5.4-mini";

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public URI getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(URI baseUrl) {
            if (baseUrl != null) {
                this.baseUrl = baseUrl;
            }
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }
    }
}
