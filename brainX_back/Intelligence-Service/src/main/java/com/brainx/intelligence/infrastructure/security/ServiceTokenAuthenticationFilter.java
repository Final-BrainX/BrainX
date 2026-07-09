package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

final class ServiceTokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String SERVICE_TOKEN_HEADER = "X-Service-Token";

    private final String serviceToken;

    ServiceTokenAuthenticationFilter(String serviceToken) {
        this.serviceToken = hasText(serviceToken) ? serviceToken : "local-service-token";
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String requestedToken = request.getHeader(SERVICE_TOKEN_HEADER);
        if (hasText(requestedToken) && MessageDigest.isEqual(
                requestedToken.getBytes(StandardCharsets.UTF_8), serviceToken.getBytes(StandardCharsets.UTF_8))) {
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "internal-service",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))
            ));
        }
        filterChain.doFilter(request, response);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
