package com.brainx.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "workspace_graph_layouts")
public class GraphLayout {
    @Id
    private String layoutId;
    @Column(nullable = false)
    private String userId;
    @Column(columnDefinition = "text", nullable = false)
    private String nodePositionsJson;
    private String quality;
    @Column(nullable = false)
    private Instant savedAt;

    public GraphLayout(String layoutId, String userId, String nodePositionsJson, String quality, Instant savedAt) {
        this.layoutId = layoutId;
        this.userId = userId;
        this.nodePositionsJson = nodePositionsJson;
        this.quality = quality;
        this.savedAt = savedAt;
    }

    public void update(String nodePositionsJson, String quality, Instant savedAt) {
        this.nodePositionsJson = nodePositionsJson;
        this.quality = quality;
        this.savedAt = savedAt;
    }
}
