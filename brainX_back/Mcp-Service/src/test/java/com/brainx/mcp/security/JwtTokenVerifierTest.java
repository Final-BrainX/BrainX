package com.brainx.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brainx.mcp.support.JwtTestTokens;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class JwtTokenVerifierTest {

    private static final String SECRET = "test-jwt-secret-for-mcp-service";

    private final JwtTokenVerifier verifier = new JwtTokenVerifier(new ObjectMapper(), SECRET);

    @Test
    void validAccessTokenSucceeds() {
        JwtTokenVerifier.JwtClaims claims = verifier.verifyAccessToken(JwtTestTokens.accessToken(SECRET, "usr_1"));

        assertThat(claims.userId()).isEqualTo("usr_1");
        assertThat(claims.tokenType()).isEqualTo("access");
    }

    @Test
    void refreshTokenFails() {
        assertThatThrownBy(() -> verifier.verifyAccessToken(JwtTestTokens.refreshToken(SECRET, "usr_1")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void expiredTokenFails() {
        assertThatThrownBy(() -> verifier.verifyAccessToken(JwtTestTokens.expiredAccessToken(SECRET, "usr_1")))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void tamperedTokenFails() {
        String token = JwtTestTokens.accessToken(SECRET, "usr_1");
        String tampered = token.substring(0, token.length() - 2) + "xx";

        assertThatThrownBy(() -> verifier.verifyAccessToken(tampered))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void missingSubjectFails() {
        assertThatThrownBy(() -> verifier.verifyAccessToken(JwtTestTokens.accessTokenWithoutSubject(SECRET)))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void validMcpAccessTokenSucceeds() {
        JwtTokenVerifier.McpJwtClaims claims = verifier.verifyMcpAccessToken(
            JwtTestTokens.mcpAccessToken(
                SECRET,
                "usr_1",
                "mcp_oauth_1",
                "whoami notes:read",
                "http://localhost:3000",
                "http://localhost:3000/mcp"
            ),
            "http://localhost:3000",
            "http://localhost:3000/mcp"
        );

        assertThat(claims.userId()).isEqualTo("usr_1");
        assertThat(claims.clientId()).isEqualTo("mcp_oauth_1");
        assertThat(claims.scopes()).containsExactly("whoami", "notes:read");
    }

    @Test
    void mcpAccessTokenRejectsWrongResource() {
        assertThatThrownBy(() -> verifier.verifyMcpAccessToken(
            JwtTestTokens.mcpAccessToken(
                SECRET,
                "usr_1",
                "mcp_oauth_1",
                "whoami",
                "http://localhost:3000",
                "http://localhost:3000/mcp"
            ),
            "http://localhost:3000",
            "http://localhost:3000/other"
        )).isInstanceOf(IllegalArgumentException.class);
    }
}
