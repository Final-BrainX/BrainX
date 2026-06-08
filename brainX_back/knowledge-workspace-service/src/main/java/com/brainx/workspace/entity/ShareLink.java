package com.brainx.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "share_links")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ShareLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "share_id", length = 36)
    private String shareId;

    @Column(name = "note_id", nullable = false, length = 36)
    private String noteId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "permission", nullable = false, length = 10)
    private Permission permission;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "revoked", nullable = false)
    @Builder.Default
    private boolean revoked = false;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Permission {
        READ, EDIT
    }
}
