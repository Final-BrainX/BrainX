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
@Table(name = "workspace_recent_activities")
public class RecentActivity {
    @Id
    private String activityId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String noteId;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String activityType;
    @Column(nullable = false)
    private Instant activityAt;

    public RecentActivity(String activityId, String userId, String noteId, String title, String activityType, Instant activityAt) {
        this.activityId = activityId;
        this.userId = userId;
        this.noteId = noteId;
        this.title = title;
        this.activityType = activityType;
        this.activityAt = activityAt;
    }
}
