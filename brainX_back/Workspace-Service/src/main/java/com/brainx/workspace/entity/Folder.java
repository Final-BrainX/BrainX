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
    private String documentGroupId;
    @Column(nullable = false)
    private String name;
    private String parentFolderId;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    public Folder(String folderId, String userId, String name, String parentFolderId, Instant now) {
        this(folderId, userId, null, name, parentFolderId, now);
    }

    public Folder(String folderId, String userId, String documentGroupId, String name, String parentFolderId, Instant now) {
        this.folderId = folderId;
        this.userId = userId;
        this.documentGroupId = documentGroupId;
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

    /** guest -> user 전환(draft claim) 시 폴더 소유자를 옮긴다. folderId는 그대로라 이 폴더를
        가리키는 다른 폴더의 parentFolderId/노트의 folderId 참조는 깨지지 않는다. */
    public void reassignOwner(String userId, Instant now) {
        this.userId = userId;
        this.updatedAt = now;
    }
}
