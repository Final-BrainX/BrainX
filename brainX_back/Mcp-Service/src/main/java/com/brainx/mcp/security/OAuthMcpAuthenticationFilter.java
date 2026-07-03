package com.brainx.mcp.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class OAuthMcpAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String API_KEY_HEADER = "X-BrainX-Api-Key";

    private final JwtTokenVerifier jwtTokenVerifier;
    private final String apiKeyPrefix;
    private final String issuer;
    private final String resource;

    public OAuthMcpAuthenticationFilter(
        JwtTokenVerifier jwtTokenVerifier,
        String apiKeyPrefix,
        String issuer,
        String resource
    ) {
        this.jwtTokenVerifier = jwtTokenVerifier;
        this.apiKeyPrefix = apiKeyPrefix;
        this.issuer = issuer;
        this.resource = resource;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication currentAuthentication = SecurityContextHolder.getContext().getAuthentication();
        if (currentAuthentication != null && currentAuthentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }
        if (hasText(request.getHeader(API_KEY_HEADER))) {
            filterChain.doFilter(request, response);
            return;
        }

        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith(BEARER_PREFIX)) {
            String token = authorization.substring(BEARER_PREFIX.length()).trim();
            if (!token.startsWith(apiKeyPrefix)) {
                authenticate(token);
            }
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(String token) {
        try {
            JwtTokenVerifier.McpJwtClaims claims = jwtTokenVerifier.verifyMcpAccessToken(token, issuer, resource);
            McpPrincipal principal = new McpPrincipal(claims.userId(), claims.clientId(), claims.scopes());
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_MCP_CLIENT"))
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (IllegalArgumentException exception) {
            SecurityContextHolder.clearContext();
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
