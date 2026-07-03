package com.brainx.mcp.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class JwtTestTokens {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private JwtTestTokens() {
    }

    public static String accessToken(String secret, String userId) {
        return token(secret, userId, "access", Instant.now().plusSeconds(3600));
    }

    public static String refreshToken(String secret, String userId) {
        return token(secret, userId, "refresh", Instant.now().plusSeconds(3600));
    }

    public static String expiredAccessToken(String secret, String userId) {
        return token(secret, userId, "access", Instant.now().minusSeconds(1));
    }

    public static String accessTokenWithoutSubject(String secret) {
        return token(secret, null, "access", Instant.now().plusSeconds(3600));
    }

    public static String mcpAccessToken(String secret, String userId, String clientId, String scope, String issuer, String resource) {
        try {
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", userId);
            payload.put("email", userId + "@example.com");
            payload.put("role", "ROLE_USER");
            payload.put("typ", "mcp_access");
            payload.put("client_id", clientId);
            payload.put("scope", scope);
            payload.put("iss", issuer);
            payload.put("aud", resource);
            payload.put("resource", resource);
            payload.put("iat", Instant.now().getEpochSecond());
            payload.put("exp", Instant.now().plusSeconds(3600).getEpochSecond());

            String encodedHeader = base64Url(OBJECT_MAPPER.writeValueAsBytes(header));
            String encodedPayload = base64Url(OBJECT_MAPPER.writeValueAsBytes(payload));
            String unsigned = encodedHeader + "." + encodedPayload;
            return unsigned + "." + sign(secret, unsigned);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String token(String secret, String userId, String type, Instant expiresAt) {
        try {
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            if (userId != null) {
                payload.put("sub", userId);
            }
            payload.put("email", userId == null ? "missing@example.com" : userId + "@example.com");
            payload.put("role", "USER");
            payload.put("typ", type);
            payload.put("iat", Instant.now().getEpochSecond());
            payload.put("exp", expiresAt.getEpochSecond());

            String encodedHeader = base64Url(OBJECT_MAPPER.writeValueAsBytes(header));
            String encodedPayload = base64Url(OBJECT_MAPPER.writeValueAsBytes(payload));
            String unsigned = encodedHeader + "." + encodedPayload;
            return unsigned + "." + sign(secret, unsigned);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String sign(String secret, String unsignedToken) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
        return base64Url(mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
