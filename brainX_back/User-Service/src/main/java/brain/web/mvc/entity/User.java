package brain.web.mvc.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Builder
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class User {

    @Id
    @Column(name = "user_id", length = 40)
    private String userId;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(length = 60)
    private String nickname;

    @Column(name = "profile_image_url", columnDefinition = "TEXT")
    private String profileImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private UserStatus status;

    @Column(nullable = false)
    private boolean emailVerified;

    @Column(nullable = false)
    private boolean twoFactorEnabled;

    @Column(name = "deletion_reason", length = 500)
    private String deletionReason;

    @Column(name = "deletion_scheduled_at")
    private LocalDateTime deletionScheduledAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        if (userId == null) {
            userId = "usr_" + UUID.randomUUID().toString().replace("-", "");
        }
        if (role == null) {
            role = UserRole.ROLE_USER;
        }
        if (status == null) {
            status = UserStatus.ACTIVE;
        }
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    public void verifyEmail() {
        this.emailVerified = true;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateProfile(String nickname, String profileImageUrl) {
        this.nickname = nickname;
        this.profileImageUrl = profileImageUrl;
        this.updatedAt = LocalDateTime.now();
    }

    public void changePassword(String password) {
        this.password = password;
        this.updatedAt = LocalDateTime.now();
    }

    public void configureTwoFactor(boolean enabled) {
        this.twoFactorEnabled = enabled;
        this.updatedAt = LocalDateTime.now();
    }

    public void requestDeletion(String reason, LocalDateTime deletionScheduledAt) {
        this.deletionReason = reason;
        this.deletionScheduledAt = deletionScheduledAt;
        this.status = UserStatus.WITHDRAWN;
        this.updatedAt = LocalDateTime.now();
    }

    public void cancelDeletion() {
        this.deletionReason = null;
        this.deletionScheduledAt = null;
        this.status = UserStatus.ACTIVE;
        this.updatedAt = LocalDateTime.now();
    }

    public void changeStatus(UserStatus status) {
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }
}
