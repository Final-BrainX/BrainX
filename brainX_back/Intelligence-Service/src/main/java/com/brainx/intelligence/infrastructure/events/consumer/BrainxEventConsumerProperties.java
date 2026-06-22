package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.events.consumer")
public class BrainxEventConsumerProperties {

    private boolean enabled;
    private String groupId = "intelligence-service";
    private List<String> topics = new ArrayList<>(List.of(
        "brainx.knowledge.workspace.note-content-saved.v1",
        "brainx.knowledge.workspace.note-created.v1",
        "brainx.knowledge.workspace.note-deleted.v1",
        "brainx.knowledge.workspace.note-metadata-changed.v1",
        "brainx.knowledge.workspace.note-tags-changed.v1",
        "brainx.knowledge.workspace.note-trashed.v1",
        "brainx.knowledge.workspace.notes-moved.v1"
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

    public List<String> getTopics() {
        return topics;
    }

    public void setTopics(List<String> topics) {
        this.topics = topics == null ? new ArrayList<>() : new ArrayList<>(topics);
    }
}
