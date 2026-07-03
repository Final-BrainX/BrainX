package com.brainx.mcp.client.domain;

import java.time.Instant;
import java.util.List;

public record McpApiClient(
    String clientId,
    String userId,
    String name,
    List<String> scopes,
    Instant expiresAt,
    Instant revokedAt,
    Instant lastUsedAt,
    Instant createdAt
) {
}
