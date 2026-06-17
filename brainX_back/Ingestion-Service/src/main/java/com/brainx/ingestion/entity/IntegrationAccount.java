package com.brainx.ingestion.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "integration_accounts", indexes = {
        @Index(name = "idx_integration_user_id", columnList = "user_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class IntegrationAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "integration_account_id", length = 36)
    private String integrationAccountId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private Provider provider;

    @Column(name = "access_token", length = 1000)
    private String accessToken;

    @Column(name = "workspace_id", length = 200)
    private String workspaceId;

    @Column(name = "workspace_name", length = 200)
    private String workspaceName;

    @Column(name = "state", length = 100)
    private String state;

    @Column(name = "redirect_uri", length = 500)
    private String redirectUri;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum Provider {
        NOTION
    }
}
