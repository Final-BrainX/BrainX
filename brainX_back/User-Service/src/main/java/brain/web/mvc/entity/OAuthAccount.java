package brain.web.mvc.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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
@Table(name = "oauth_accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class OAuthAccount {

    @Id
    @Column(name = "oauth_account_id", length = 40)
    private String oauthAccountId;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 30)
    private String provider;

    @Column(nullable = false, length = 255)
    private String providerUserId;

    @Column(nullable = false)
    private LocalDateTime linkedAt;

    @PrePersist
    void prePersist() {
        if (oauthAccountId == null) {
            oauthAccountId = "oac_" + UUID.randomUUID().toString().replace("-", "");
        }
        if (linkedAt == null) {
            linkedAt = LocalDateTime.now();
        }
    }
}
