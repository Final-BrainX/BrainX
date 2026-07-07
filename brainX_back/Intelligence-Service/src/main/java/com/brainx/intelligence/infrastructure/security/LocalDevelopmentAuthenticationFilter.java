package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

final class LocalDevelopmentAuthenticationFilter extends OncePerRequestFilter {

    private static final String DEV_USER_ID_HEADER = "X-User-Id";

    private final String devUserId;

    LocalDevelopmentAuthenticationFilter(String devUserId) {
        this.devUserId = hasText(devUserId) ? devUserId : "dev-test-user";
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication previousAuthentication = SecurityContextHolder.getContext().getAuthentication();
        if (previousAuthentication == null && request.getRequestURI().startsWith("/api/v1/")) {
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                userId(request),
                "local-development",
                AuthorityUtils.NO_AUTHORITIES
            ));
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            if (previousAuthentication == null) {
                SecurityContextHolder.clearContext();
            } else {
                SecurityContextHolder.getContext().setAuthentication(previousAuthentication);
            }
        }
    }

    private String userId(HttpServletRequest request) {
        String userId = request.getHeader(DEV_USER_ID_HEADER);
        return hasText(userId) ? userId : devUserId;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
