package com.brainx.intelligence.infrastructure.ai.voyage;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "brainx.ai.embedding")
public class VoyageEmbeddingProperties {

    private String provider = "none";
    private Voyage voyage = new Voyage();

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public Voyage getVoyage() {
        return voyage;
    }

    public void setVoyage(Voyage voyage) {
        this.voyage = voyage;
    }

    public static class Voyage {

        private String apiKey = "";
        private URI baseUrl = URI.create("https://api.voyageai.com");
        private String model = "voyage-4-lite";
        private int dimensions = 1024;
        private boolean truncation = true;
        private Duration timeout = Duration.ofSeconds(10);

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
            this.baseUrl = baseUrl;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public int getDimensions() {
            return dimensions;
        }

        public void setDimensions(int dimensions) {
            this.dimensions = dimensions;
        }

        public boolean isTruncation() {
            return truncation;
        }

        public void setTruncation(boolean truncation) {
            this.truncation = truncation;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(Duration timeout) {
            this.timeout = timeout;
        }
    }
}
