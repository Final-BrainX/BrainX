package com.brainx.mcp.security;

import com.brainx.mcp.client.application.ApiKeyAuthenticator;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String API_KEY_HEADER = "X-BrainX-Api-Key";

    private final ApiKeyAuthenticator apiKeyAuthenticator;
    private final String apiKeyPrefix;

    public ApiKeyAuthenticationFilter(ApiKeyAuthenticator apiKeyAuthenticator, String apiKeyPrefix) {
        this.apiKeyAuthenticator = apiKeyAuthenticator;
        this.apiKeyPrefix = apiKeyPrefix;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String apiKey = apiKey(request);
        if (apiKey != null) {
            authenticate(apiKey);
        }
        filterChain.doFilter(request, response);
    }

    private String apiKey(HttpServletRequest request) {
        String headerApiKey = request.getHeader(API_KEY_HEADER);
        if (hasText(headerApiKey)) {
            return headerApiKey.trim();
        }
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith(BEARER_PREFIX)) {
            String token = authorization.substring(BEARER_PREFIX.length()).trim();
            if (token.startsWith(apiKeyPrefix)) {
                return token;
            }
        }
        return null;
    }

    private void authenticate(String apiKey) {
        apiKeyAuthenticator.authenticate(apiKey)
            .ifPresent(principal -> {
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    principal,
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_MCP_CLIENT"))
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            });
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
