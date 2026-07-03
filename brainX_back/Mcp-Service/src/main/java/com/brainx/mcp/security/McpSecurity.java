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

    public static McpPrincipal currentApiClient(String... requiredScopes) {
        McpPrincipal principal = currentApiClient();
        for (String requiredScope : requiredScopes) {
            if (!hasScope(principal, requiredScope)) {
                throw new IllegalStateException("MCP API key requires scope: " + requiredScope);
            }
        }
        return principal;
    }

    private static boolean hasScope(McpPrincipal principal, String requiredScope) {
        if (requiredScope == null || requiredScope.isBlank()) {
            return true;
        }
        return principal.scopes() != null && principal.scopes().stream()
            .filter(scope -> scope != null && !scope.isBlank())
            .map(String::trim)
            .anyMatch(scope -> scope.equals("*") || scope.equals(requiredScope));
    }
}
