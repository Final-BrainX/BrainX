package brain.web.mvc.oauth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "mcp_oauth_consents")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthConsentEntity {

    @Id
    @Column(name = "consent_id", length = 180)
    private String consentId;

    @Column(name = "user_id", nullable = false, length = 40)
    private String userId;

    @Column(name = "client_id", nullable = false, length = 80)
    private String clientId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String scopes;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public OAuthConsentEntity(String userId, String clientId, List<String> scopes) {
        this.consentId = userId + ":" + clientId;
        this.userId = userId;
        this.clientId = clientId;
        this.scopes = String.join("\n", scopes == null ? List.of() : scopes);
        this.updatedAt = LocalDateTime.now();
    }

    public void updateScopes(List<String> nextScopes) {
        this.scopes = String.join("\n", nextScopes == null ? List.of() : nextScopes);
        this.updatedAt = LocalDateTime.now();
    }
}
