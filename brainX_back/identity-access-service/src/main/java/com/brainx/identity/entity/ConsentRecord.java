package com.brainx.identity.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "consent_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ConsentRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "consent_id", length = 36)
    private String consentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "terms_required", nullable = false)
    @Builder.Default
    private boolean termsRequired = false;

    @Column(name = "privacy_required", nullable = false)
    @Builder.Default
    private boolean privacyRequired = false;

    @Column(name = "marketing_optional", nullable = false)
    @Builder.Default
    private boolean marketingOptional = false;

    @Column(name = "behavior_analytics_optional", nullable = false)
    @Builder.Default
    private boolean behaviorAnalyticsOptional = false;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
