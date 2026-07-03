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
@Table(name = "mcp_oauth_authorization_codes")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthAuthorizationCodeEntity {

    @Id
    @Column(name = "code_hash", length = 80)
    private String codeHash;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "client_id", nullable = false, length = 80)
    private String clientId;

    @Column(name = "redirect_uri", nullable = false, columnDefinition = "TEXT")
    private String redirectUri;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String resource;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String scopes;

    @Column(name = "code_challenge", nullable = false, length = 160)
    private String codeChallenge;

    @Column(name = "code_challenge_method", nullable = false, length = 20)
    private String codeChallengeMethod;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public OAuthAuthorizationCodeEntity(
        String codeHash,
        User user,
        String clientId,
        String redirectUri,
        String resource,
        List<String> scopes,
        String codeChallenge,
        String codeChallengeMethod,
        LocalDateTime expiresAt
    ) {
        this.codeHash = codeHash;
        this.user = user;
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        this.resource = resource;
        this.scopes = String.join("\n", scopes == null ? List.of() : scopes);
        this.codeChallenge = codeChallenge;
        this.codeChallengeMethod = codeChallengeMethod;
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public boolean isUsable(LocalDateTime now) {
        return consumedAt == null && expiresAt.isAfter(now);
    }

    public void consume() {
        consumedAt = LocalDateTime.now();
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
