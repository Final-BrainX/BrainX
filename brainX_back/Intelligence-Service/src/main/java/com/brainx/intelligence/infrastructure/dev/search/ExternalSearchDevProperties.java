package com.brainx.intelligence.infrastructure.dev.search;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.dev.external-search")
public class ExternalSearchDevProperties {

    private boolean enabled;
    private String query = "";
    private String userId = "sample-user";
    private String modelId = "";
    private int maxSources;
    private boolean streamEvents;
    private List<String> allowedDomains = new ArrayList<>();
    private List<String> blockedDomains = new ArrayList<>();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getModelId() {
        return modelId;
    }

    public void setModelId(String modelId) {
        this.modelId = modelId;
    }

    public int getMaxSources() {
        return maxSources;
    }

    public void setMaxSources(int maxSources) {
        this.maxSources = Math.max(0, maxSources);
    }

    public boolean isStreamEvents() {
        return streamEvents;
    }

    public void setStreamEvents(boolean streamEvents) {
        this.streamEvents = streamEvents;
    }

    public List<String> getAllowedDomains() {
        return allowedDomains;
    }

    public void setAllowedDomains(List<String> allowedDomains) {
        this.allowedDomains = normalize(allowedDomains);
    }

    public List<String> getBlockedDomains() {
        return blockedDomains;
    }

    public void setBlockedDomains(List<String> blockedDomains) {
        this.blockedDomains = normalize(blockedDomains);
    }

    private static List<String> normalize(List<String> values) {
        if (values == null || values.isEmpty()) {
            return new ArrayList<>();
        }
        ArrayList<String> normalized = new ArrayList<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                normalized.add(value.trim());
            }
        }
        return normalized;
    }
}
