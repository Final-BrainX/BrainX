package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.ArrayList;
import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.events.consumer")
public class BrainxEventConsumerProperties {

    private boolean enabled;
    private String groupId = "intelligence-service";
    private Duration retryInterval = Duration.ofSeconds(1);
    private int maxAttempts = 10;
    private List<String> topics = new ArrayList<>(List.of(
        "brainx.content.ingestion.publishing.capture-received.v1",
        "brainx.knowledge.workspace.note-link-created.v1",
        "brainx.knowledge.workspace.note-link-deleted.v1",
        "brainx.knowledge.workspace.folder-created.v1",
        "brainx.knowledge.workspace.folder-changed.v1",
        "brainx.knowledge.workspace.folder-deleted.v1",
        "brainx.identity.access.user-deletion-requested.v1",
        "brainx.knowledge.workspace.note-content-saved.v1",
        "brainx.knowledge.workspace.note-created.v1",
        "brainx.knowledge.workspace.note-deleted.v1",
        "brainx.knowledge.workspace.note-metadata-changed.v1",
        "brainx.knowledge.workspace.note-tags-changed.v1",
        "brainx.knowledge.workspace.note-trashed.v1"
    ));

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getGroupId() {
        return groupId;
    }

    public void setGroupId(String groupId) {
        this.groupId = groupId;
    }

    public Duration getRetryInterval() {
        return retryInterval;
    }

    public void setRetryInterval(Duration retryInterval) {
        if (retryInterval == null || retryInterval.isNegative()) {
            throw new IllegalArgumentException("retryInterval must not be negative.");
        }
        this.retryInterval = retryInterval;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException("maxAttempts must be at least 1.");
        }
        this.maxAttempts = maxAttempts;
    }

    public List<String> getTopics() {
        return topics;
    }

    public void setTopics(List<String> topics) {
        this.topics = topics == null ? new ArrayList<>() : new ArrayList<>(topics);
    }
}
