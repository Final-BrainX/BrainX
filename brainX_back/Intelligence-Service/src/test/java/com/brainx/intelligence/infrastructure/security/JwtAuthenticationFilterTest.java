package com.brainx.intelligence.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;

class JwtAuthenticationFilterTest {

    private static final String TEST_SECRET = "brainx_test_secret_that_is_at_least_32_bytes";

    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
        new JwtTokenVerifier(new ObjectMapper(), TEST_SECRET)
    );

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void rejectsArbitraryUserIdFromGuestHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Guest-Id", "user-1");

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void authenticatesGatewayShapedGuestId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Guest-Id", "  gst_1234567890abcdef  ");

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication())
            .satisfies(authentication -> {
                assertThat(authentication.getName()).isEqualTo("gst_1234567890abcdef");
                assertThat(authentication.getAuthorities())
                    .extracting(Object::toString)
                    .containsExactly("ROLE_GUEST");
            });
    }

    @Test
    void fallsBackToGatewayGuestWhenBearerTokenIsInvalid() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer expired-or-invalid-token");
        request.addHeader("X-Guest-Id", "gst_1234567890abcdef");

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication())
            .satisfies(authentication -> {
                assertThat(authentication.getName()).isEqualTo("gst_1234567890abcdef");
                assertThat(authentication.getAuthorities())
                    .extracting(Object::toString)
                    .containsExactly("ROLE_GUEST");
            });
    }
}
