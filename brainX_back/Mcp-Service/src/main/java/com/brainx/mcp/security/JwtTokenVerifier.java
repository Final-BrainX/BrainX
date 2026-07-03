package com.brainx.mcp.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class JwtTokenVerifier {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final ObjectMapper objectMapper;
    private final String secret;

    public JwtTokenVerifier(ObjectMapper objectMapper, String secret) {
        this.objectMapper = objectMapper;
        this.secret = secret;
    }

    public JwtClaims verifyAccessToken(String token) {
        Map<String, Object> claims = claims(token);
        String tokenType = stringClaim(claims, "typ");
        if (!"access".equals(tokenType)) {
            throw new IllegalArgumentException("Unsupported token type");
        }

        Number expiration = numberClaim(claims, "exp");
        if (expiration == null || expiration.longValue() <= Instant.now().getEpochSecond()) {
            throw new IllegalArgumentException("Expired token");
        }

        String userId = stringClaim(claims, "sub");
        if (!hasText(userId)) {
            throw new IllegalArgumentException("Missing subject");
        }

        return new JwtClaims(
            userId,
            stringClaim(claims, "email"),
            stringClaim(claims, "role"),
            tokenType
        );
    }

    public McpJwtClaims verifyMcpAccessToken(String token, String expectedIssuer, String expectedResource) {
        Map<String, Object> claims = claims(token);
        String tokenType = stringClaim(claims, "typ");
        if (!"mcp_access".equals(tokenType)) {
            throw new IllegalArgumentException("Unsupported token type");
        }

        Number expiration = numberClaim(claims, "exp");
        if (expiration == null || expiration.longValue() <= Instant.now().getEpochSecond()) {
            throw new IllegalArgumentException("Expired token");
        }

        String userId = stringClaim(claims, "sub");
        if (!hasText(userId)) {
            throw new IllegalArgumentException("Missing subject");
        }

        String issuer = stringClaim(claims, "iss");
        if (hasText(expectedIssuer) && !stripTrailingSlash(expectedIssuer).equals(stripTrailingSlash(issuer))) {
            throw new IllegalArgumentException("Invalid issuer");
        }

        String resource = stringClaim(claims, "resource");
        if (!hasText(resource)) {
            resource = audience(claims);
        }
        if (hasText(expectedResource) && !stripTrailingSlash(expectedResource).equals(stripTrailingSlash(resource))) {
            throw new IllegalArgumentException("Invalid resource");
        }

        String clientId = stringClaim(claims, "client_id");
        if (!hasText(clientId)) {
            throw new IllegalArgumentException("Missing client_id");
        }

        return new McpJwtClaims(
            userId,
            clientId,
            scopes(stringClaim(claims, "scope")),
            tokenType,
            issuer,
            resource
        );
    }

    private Map<String, Object> claims(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw new IllegalArgumentException("Invalid token");
            }

            String unsignedToken = parts[0] + "." + parts[1];
            String expectedSignature = sign(unsignedToken);
            if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                parts[2].getBytes(StandardCharsets.UTF_8)
            )) {
                throw new IllegalArgumentException("Invalid signature");
            }

            byte[] decodedPayload = Base64.getUrlDecoder().decode(parts[1]);
            return objectMapper.readValue(decodedPayload, new TypeReference<>() {
            });
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid token", exception);
        }
    }

    private String sign(String unsignedToken) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
    }

    private static String stringClaim(Map<String, Object> claims, String key) {
        Object value = claims.get(key);
        return value instanceof String stringValue ? stringValue : null;
    }

    private static Number numberClaim(Map<String, Object> claims, String key) {
        Object value = claims.get(key);
        return value instanceof Number numberValue ? numberValue : null;
    }

    private static String audience(Map<String, Object> claims) {
        Object value = claims.get("aud");
        if (value instanceof String stringValue) {
            return stringValue;
        }
        if (value instanceof List<?> listValue && !listValue.isEmpty() && listValue.get(0) instanceof String stringValue) {
            return stringValue;
        }
        return null;
    }

    private static List<String> scopes(String value) {
        if (!hasText(value)) {
            return List.of();
        }
        return Arrays.stream(value.split("\\s+"))
            .map(String::trim)
            .filter(scope -> !scope.isBlank())
            .toList();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String stripTrailingSlash(String value) {
        if (!hasText(value)) {
            return "";
        }
        String normalized = value.trim();
        while (normalized.endsWith("/") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    public record JwtClaims(
        String userId,
        String email,
        String role,
        String tokenType
    ) {
    }

    public record McpJwtClaims(
        String userId,
        String clientId,
        List<String> scopes,
        String tokenType,
        String issuer,
        String resource
    ) {
    }
}
