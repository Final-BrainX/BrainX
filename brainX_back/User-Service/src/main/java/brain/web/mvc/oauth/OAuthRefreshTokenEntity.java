package brain.web.mvc.oauth;

import brain.web.mvc.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "mcp_oauth_refresh_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthRefreshTokenEntity {

    @Id
    @Column(name = "token_hash", length = 80)
    private String tokenHash;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "client_id", nullable = false, length = 80)
    private String clientId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String resource;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String scopes;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "replaced_by_hash", length = 80)
    private String replacedByHash;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public OAuthRefreshTokenEntity(
        String tokenHash,
        User user,
        String clientId,
        String resource,
        List<String> scopes,
        LocalDateTime expiresAt
    ) {
        this.tokenHash = tokenHash;
        this.user = user;
        this.clientId = clientId;
        this.resource = resource;
        this.scopes = String.join("\n", scopes == null ? List.of() : scopes);
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public boolean isUsable(LocalDateTime now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    public void rotateTo(String nextTokenHash) {
        revokedAt = LocalDateTime.now();
        replacedByHash = nextTokenHash;
    }

    public List<String> scopeList() {
        if (scopes == null || scopes.isBlank()) {
            return List.of();
        }
        return Arrays.stream(scopes.split("\\R"))
            .map(String::trim)
            .filter(scope -> !scope.isBlank())
            .toList();
    }
}
