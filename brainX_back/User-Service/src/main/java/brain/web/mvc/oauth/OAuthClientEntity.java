package brain.web.mvc.oauth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
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
@Table(name = "mcp_oauth_clients")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthClientEntity {

    @Id
    @Column(name = "client_id", length = 80)
    private String clientId;

    @Column(name = "client_name", nullable = false, length = 200)
    private String clientName;

    @Column(name = "redirect_uris", nullable = false, columnDefinition = "TEXT")
    private String redirectUris;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String scopes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public OAuthClientEntity(String clientId, String clientName, List<String> redirectUris, List<String> scopes) {
        this.clientId = clientId;
        this.clientName = clientName;
        this.redirectUris = encode(redirectUris);
        this.scopes = encode(scopes);
    }

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public List<String> redirectUriList() {
        return decode(redirectUris);
    }

    public List<String> scopeList() {
        return decode(scopes);
    }

    private static String encode(List<String> values) {
        return String.join("\n", values == null ? List.of() : values);
    }

    private static List<String> decode(String values) {
        if (values == null || values.isBlank()) {
            return List.of();
        }
        return Arrays.stream(values.split("\\R"))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .toList();
    }
}
