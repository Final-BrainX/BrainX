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
@Table(name = "workspace_share_links")
public class ShareLink {
    @Id
    private String shareId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String noteId;
    @Column(nullable = false)
    private String permission;
    @Column(nullable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private boolean revoked;
    @Column(nullable = false)
    private Instant createdAt;

    public ShareLink(String shareId, String userId, String noteId, String permission, Instant expiresAt, Instant createdAt) {
        this.shareId = shareId;
        this.userId = userId;
        this.noteId = noteId;
        this.permission = permission;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    public void patch(Instant expiresAt, Boolean revoked) {
        if (expiresAt != null) {
            this.expiresAt = expiresAt;
        }
        if (revoked != null) {
            this.revoked = revoked;
        }
    }
}
