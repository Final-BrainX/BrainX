package com.brainx.mcp.security;

import java.util.List;

public record McpPrincipal(
    String userId,
    String clientId,
    List<String> scopes
) {
}
