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
@Table(name = "workspace_favorites")
public class Favorite {
    @Id
    private String favoriteId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String targetType;
    @Column(nullable = false)
    private String targetId;
    @Column(nullable = false)
    private boolean enabled;
    @Column(nullable = false)
    private Instant updatedAt;

    public Favorite(String favoriteId, String userId, String targetType, String targetId, boolean enabled, Instant updatedAt) {
        this.favoriteId = favoriteId;
        this.userId = userId;
        this.targetType = targetType;
        this.targetId = targetId;
        this.enabled = enabled;
        this.updatedAt = updatedAt;
    }

    public void setEnabled(boolean enabled, Instant updatedAt) {
        this.enabled = enabled;
        this.updatedAt = updatedAt;
    }
}
