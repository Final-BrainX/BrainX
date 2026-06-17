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
@Table(name = "workspace_folders")
public class Folder {
    @Id
    private String folderId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String name;
    private String parentFolderId;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    public Folder(String folderId, String userId, String name, String parentFolderId, Instant now) {
        this.folderId = folderId;
        this.userId = userId;
        this.name = name;
        this.parentFolderId = parentFolderId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void patch(String name, String parentFolderId, Instant now) {
        if (name != null && !name.isBlank()) {
            this.name = name;
        }
        if (parentFolderId != null) {
            this.parentFolderId = parentFolderId.isBlank() ? null : parentFolderId;
        }
        this.updatedAt = now;
    }
}
