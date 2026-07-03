package com.brainx.mcp.client.persistence;

import com.brainx.mcp.client.domain.McpApiClient;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

@Entity
@Table(name = "mcp_api_clients")
public class McpApiClientEntity {

    @Id
    @Column(name = "client_id", nullable = false, length = 80)
    private String clientId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "secret_hash", nullable = false, length = 120)
    private String secretHash;

    @Column(name = "scopes", nullable = false, columnDefinition = "text")
    private String scopes;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected McpApiClientEntity() {
    }

    public McpApiClientEntity(
        String clientId,
        String userId,
        String name,
        String secretHash,
        List<String> scopes,
        Instant expiresAt,
        Instant createdAt
    ) {
        this.clientId = clientId;
        this.userId = userId;
        this.name = name;
        this.secretHash = secretHash;
        this.scopes = encodeScopes(scopes);
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    public String getClientId() {
        return clientId;
    }

    public String getUserId() {
        return userId;
    }

    public String getSecretHash() {
        return secretHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void revoke(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }

    public void markUsed(Instant lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }

    public McpApiClient toDomain() {
        return new McpApiClient(
            clientId,
            userId,
            name,
            decodeScopes(scopes),
            expiresAt,
            revokedAt,
            lastUsedAt,
            createdAt
        );
    }

    private static String encodeScopes(List<String> scopes) {
        return String.join("\n", scopes == null ? List.of() : scopes);
    }

    private static List<String> decodeScopes(String scopes) {
        if (scopes == null || scopes.isBlank()) {
            return List.of();
        }
        return Arrays.stream(scopes.split("\\R"))
            .filter(scope -> !scope.isBlank())
            .toList();
    }
}
