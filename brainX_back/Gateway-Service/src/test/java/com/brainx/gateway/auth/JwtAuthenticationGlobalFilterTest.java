package com.brainx.gateway.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class JwtAuthenticationGlobalFilterTest {
    private static final String SECRET = "test-secret-with-at-least-32-byte-value";
    private static final String SERVICE_TOKEN = "test-service-token";

    private final GatewayAuthProperties authProperties = authProperties();
    private final JwtAuthenticationGlobalFilter filter = new JwtAuthenticationGlobalFilter(
            new JwtTokenVerifier(new ObjectMapper(), SECRET),
            authProperties,
            SERVICE_TOKEN
    );

    @Test
    void allowsPublicPathWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/auth/login")
        );
        AtomicReference<String> userHeader = new AtomicReference<>();
        GatewayFilterChain chain = chainWithUserHeaderCapture(userHeader);

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
        assertThat(userHeader.get()).isNull();
    }

    @Test
    void allowsPrometheusPathWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/actuator/prometheus")
        );
        GatewayFilterChain chain = ignored -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void createsGuestActorForWorkspacePathWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/notes")
        );
        AtomicReference<String> guestHeader = new AtomicReference<>();
        GatewayFilterChain chain = filteredExchange -> {
            guestHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.GUEST_ID_HEADER));
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
        assertThat(guestHeader.get()).startsWith("gst_");
        assertThat(exchange.getResponse().getCookies().getFirst(JwtAuthenticationGlobalFilter.GUEST_ID_COOKIE)).isNotNull();
    }

    @Test
    void rejectsNonWorkspaceProtectedPathWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/users/me")
        );
        GatewayFilterChain chain = ignored -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void addsUserHeadersForValidAccessToken() {
        String token = JwtTokenTestSupport.accessToken(
                SECRET,
                "usr_123",
                "user@example.com",
                "ROLE_USER",
                Instant.now().plusSeconds(60)
        );
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/notes")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .header(JwtAuthenticationGlobalFilter.USER_ID_HEADER, "spoofed")
        );
        AtomicReference<String> userHeader = new AtomicReference<>();
        AtomicReference<String> emailHeader = new AtomicReference<>();
        AtomicReference<String> roleHeader = new AtomicReference<>();
        GatewayFilterChain chain = filteredExchange -> {
            userHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_ID_HEADER));
            emailHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_EMAIL_HEADER));
            roleHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_ROLE_HEADER));
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(userHeader.get()).isEqualTo("usr_123");
        assertThat(emailHeader.get()).isEqualTo("user@example.com");
        assertThat(roleHeader.get()).isEqualTo("ROLE_USER");
    }

    @Test
    void keepsGuestHeaderForValidAccessTokenWhenGuestCookieExists() {
        String token = JwtTokenTestSupport.accessToken(
                SECRET,
                "usr_123",
                "user@example.com",
                "ROLE_USER",
                Instant.now().plusSeconds(60)
        );
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/v1/notes/drafts/claim")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .cookie(new HttpCookie(JwtAuthenticationGlobalFilter.GUEST_ID_COOKIE, "gst_1234567890abcdef"))
        );
        AtomicReference<String> userHeader = new AtomicReference<>();
        AtomicReference<String> guestHeader = new AtomicReference<>();
        GatewayFilterChain chain = filteredExchange -> {
            userHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_ID_HEADER));
            guestHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.GUEST_ID_HEADER));
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(userHeader.get()).isEqualTo("usr_123");
        assertThat(guestHeader.get()).isEqualTo("gst_1234567890abcdef");
    }

    @Test
    void fallsBackToGuestForWorkspacePathWithInvalidAccessToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/notes/drafts/list")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer invalid-token")
        );
        AtomicReference<String> guestHeader = new AtomicReference<>();
        AtomicReference<String> userHeader = new AtomicReference<>();
        GatewayFilterChain chain = filteredExchange -> {
            guestHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.GUEST_ID_HEADER));
            userHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_ID_HEADER));
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
        assertThat(guestHeader.get()).startsWith("gst_");
        assertThat(userHeader.get()).isNull();
    }

    @Test
    void allowsOptionsWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.OPTIONS, "/api/v1/notes")
        );
        GatewayFilterChain chain = ignored -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void rejectsInternalPathWithoutServiceToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/internal/v1/users")
        );
        GatewayFilterChain chain = ignored -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void allowsInternalPathWithServiceToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/internal/v1/users")
                        .header("X-Service-Token", SERVICE_TOKEN)
        );
        AtomicReference<String> userHeader = new AtomicReference<>();
        GatewayFilterChain chain = chainWithUserHeaderCapture(userHeader);

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
        assertThat(userHeader.get()).isNull();
    }

    private GatewayAuthProperties authProperties() {
        GatewayAuthProperties properties = new GatewayAuthProperties();
        properties.setPublicPaths(List.of(
                "/actuator/health",
                "/actuator/info",
                "/actuator/prometheus",
                "/api/v1/auth/**",
                "/api/v1/plans",
                "/api/v1/plans/**"
        ));
        return properties;
    }

    private GatewayFilterChain chainWithUserHeaderCapture(AtomicReference<String> userHeader) {
        return filteredExchange -> {
            userHeader.set(filteredExchange.getRequest().getHeaders().getFirst(JwtAuthenticationGlobalFilter.USER_ID_HEADER));
            return Mono.empty();
        };
    }
}
