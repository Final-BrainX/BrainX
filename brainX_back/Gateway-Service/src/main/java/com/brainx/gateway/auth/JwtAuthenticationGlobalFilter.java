package com.brainx.gateway.auth;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
public class JwtAuthenticationGlobalFilter implements GlobalFilter, Ordered {
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USER_EMAIL_HEADER = "X-User-Email";
    public static final String USER_ROLE_HEADER = "X-User-Role";
    public static final String GUEST_ID_HEADER = "X-Guest-Id";
    public static final String GUEST_ID_COOKIE = "brainx_guest_id";

    private static final String BEARER_PREFIX = "Bearer ";
    private static final int AUTH_FILTER_ORDER = -100;
    private static final Pattern GUEST_ID_PATTERN = Pattern.compile("gst_[A-Za-z0-9_-]{16,80}");

    private final JwtTokenVerifier jwtTokenVerifier;
    private final GatewayAuthProperties authProperties;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final String serviceToken;

    public JwtAuthenticationGlobalFilter(
            JwtTokenVerifier jwtTokenVerifier,
            GatewayAuthProperties authProperties,
            @Value("${brainx.service-token}") String serviceToken
    ) {
        this.jwtTokenVerifier = jwtTokenVerifier;
        this.authProperties = authProperties;
        this.serviceToken = serviceToken;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = sanitizeInternalHeaders(exchange.getRequest());
        ServerWebExchange sanitizedExchange = exchange.mutate().request(request).build();

        if (isPublicRequest(request)) {
            return chain.filter(sanitizedExchange);
        }

        if (isInternalServiceRequest(request)) {
            return chain.filter(sanitizedExchange);
        }

        Optional<String> token = bearerToken(request);
        if (token.isEmpty()) {
            if (isGuestWorkspaceRequest(request)) {
                return authenticateGuest(sanitizedExchange, chain, request);
            }
            return unauthorized(sanitizedExchange);
        }

        try {
            JwtClaims claims = jwtTokenVerifier.verifyAccessToken(token.get());
            ServerHttpRequest authenticatedRequest = request.mutate()
                    .headers(headers -> {
                        headers.set(USER_ID_HEADER, claims.userId());
                        setIfPresent(headers, USER_EMAIL_HEADER, claims.email());
                        setIfPresent(headers, USER_ROLE_HEADER, claims.role());
                    })
                    .build();
            return chain.filter(sanitizedExchange.mutate().request(authenticatedRequest).build());
        } catch (IllegalArgumentException exception) {
            if (isGuestWorkspaceRequest(request)) {
                return authenticateGuest(sanitizedExchange, chain, request);
            }
            return unauthorized(sanitizedExchange);
        }
    }

    @Override
    public int getOrder() {
        return AUTH_FILTER_ORDER;
    }

    private boolean isPublicRequest(ServerHttpRequest request) {
        if (HttpMethod.OPTIONS.equals(request.getMethod())) {
            return true;
        }

        String path = request.getPath().pathWithinApplication().value();
        return authProperties.getPublicPaths().stream()
                .anyMatch(pattern -> pathMatcher.match(pattern, path));
    }

    private boolean isInternalServiceRequest(ServerHttpRequest request) {
        String path = request.getPath().pathWithinApplication().value();
        if (!pathMatcher.match("/internal/v1/**", path)) {
            return false;
        }

        String requestedToken = request.getHeaders().getFirst("X-Service-Token");
        return requestedToken != null && !requestedToken.isBlank() && requestedToken.equals(serviceToken);
    }

    private boolean isGuestWorkspaceRequest(ServerHttpRequest request) {
        String path = request.getPath().pathWithinApplication().value();
        return pathMatcher.match("/api/v1/workspace/**", path)
                || pathMatcher.match("/api/v1/notes", path)
                || pathMatcher.match("/api/v1/notes/**", path)
                || pathMatcher.match("/api/v1/folders", path)
                || pathMatcher.match("/api/v1/folders/**", path)
                || pathMatcher.match("/api/v1/recent-activities", path)
                || pathMatcher.match("/api/v1/recent-activities/**", path)
                || pathMatcher.match("/api/v1/tags/**", path)
                || pathMatcher.match("/api/v1/favorites/**", path)
                || pathMatcher.match("/api/v1/graph", path)
                || pathMatcher.match("/api/v1/graph/**", path);
    }

    private Mono<Void> authenticateGuest(ServerWebExchange exchange, GatewayFilterChain chain, ServerHttpRequest request) {
        String guestId = request.getCookies().getFirst(GUEST_ID_COOKIE) != null
                ? request.getCookies().getFirst(GUEST_ID_COOKIE).getValue()
                : null;
        boolean shouldSetCookie = guestId == null || !GUEST_ID_PATTERN.matcher(guestId).matches();
        if (shouldSetCookie) {
            guestId = "gst_" + UUID.randomUUID();
            ResponseCookie cookie = ResponseCookie.from(GUEST_ID_COOKIE, guestId)
                    .httpOnly(true)
                    .sameSite("Lax")
                    .path("/")
                    .maxAge(java.time.Duration.ofDays(1))
                    .build();
            exchange.getResponse().addCookie(cookie);
        }

        String effectiveGuestId = guestId;
        ServerHttpRequest guestRequest = request.mutate()
                .headers(headers -> headers.set(GUEST_ID_HEADER, effectiveGuestId))
                .build();
        return chain.filter(exchange.mutate().request(guestRequest).build());
    }

    private Optional<String> bearerToken(ServerHttpRequest request) {
        String authorization = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return Optional.empty();
        }

        String token = authorization.substring(BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? Optional.empty() : Optional.of(token);
    }

    private ServerHttpRequest sanitizeInternalHeaders(ServerHttpRequest request) {
        return request.mutate()
                .headers(headers -> {
                    headers.remove(USER_ID_HEADER);
                    headers.remove(USER_EMAIL_HEADER);
                    headers.remove(USER_ROLE_HEADER);
                    headers.remove(GUEST_ID_HEADER);
                })
                .build();
    }

    private void setIfPresent(HttpHeaders headers, String name, String value) {
        if (value != null && !value.isBlank()) {
            headers.set(name, value);
        }
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        byte[] body = "{\"message\":\"Unauthorized\"}".getBytes(StandardCharsets.UTF_8);
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body)));
    }
}
