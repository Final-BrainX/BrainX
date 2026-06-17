package com.brainx.workspace.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

@Component
public class JwtTokenProvider {
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private final ObjectMapper objectMapper;
    private final String secret;

    public JwtTokenProvider(ObjectMapper objectMapper, @Value("${brainx.jwt.secret}") String secret) {
        this.objectMapper = objectMapper;
        this.secret = secret;
    }

    public boolean isValid(String token) {
        try {
            Map<String, Object> claims = claims(token);
            Number exp = (Number) claims.get("exp");
            return exp != null && exp.longValue() > Instant.now().getEpochSecond();
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public String getUserId(String token) {
        return (String) claims(token).get("sub");
    }

    public String getTokenType(String token) {
        return (String) claims(token).get("typ");
    }

    private Map<String, Object> claims(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw new IllegalArgumentException("Invalid token");
            }
            String unsignedToken = parts[0] + "." + parts[1];
            if (!sign(unsignedToken).equals(parts[2])) {
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
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
    }
}
