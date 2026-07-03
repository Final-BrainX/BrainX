package com.brainx.mcp.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class McpSecurity {

    private McpSecurity() {
    }

    public static String currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            throw new IllegalStateException("Authentication required");
        }
        return authentication.getName();
    }

    public static McpPrincipal currentApiClient() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof McpPrincipal principal) {
            return principal;
        }
        throw new IllegalStateException("MCP API key authentication required");
    }
}
