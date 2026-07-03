package com.brainx.mcp.security;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OAuthProtectedResourceController {

    private final String issuer;
    private final String resource;

    public OAuthProtectedResourceController(
        @Value("${brainx.oauth.issuer}") String issuer,
        @Value("${brainx.oauth.resource}") String resource
    ) {
        this.issuer = stripTrailingSlash(issuer);
        this.resource = stripTrailingSlash(resource);
    }

    @GetMapping("/.well-known/oauth-protected-resource")
    public ResponseEntity<Map<String, Object>> metadata() {
        return ResponseEntity.ok(Map.of(
            "resource", resource,
            "authorization_servers", List.of(issuer),
            "scopes_supported", List.of("whoami", "notes:read", "ai:search", "notes:write")
        ));
    }

    private static String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        while (normalized.endsWith("/") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
