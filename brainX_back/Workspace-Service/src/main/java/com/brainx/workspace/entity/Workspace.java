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
@Table(name = "document_groups")
public class Workspace {
    @Id
    @Column(name = "document_group_id")
    private String documentGroupId;

    private String userId;

    private String name;

    private Boolean isDefault;

    private Instant createdAt;

    private Instant updatedAt;

    public Workspace(String documentGroupId, String userId, String name, boolean isDefault, Instant now) {
        this.documentGroupId = documentGroupId;
        this.userId = userId;
        this.name = name;
        this.isDefault = isDefault;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void rename(String name, Instant now) {
        this.name = name;
        this.updatedAt = now;
    }
}
