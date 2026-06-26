package com.brainx.admin.security;

import com.brainx.admin.entity.AdminAccount;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Gateway-Service의 JwtTokenVerifier와 동일한 HMAC-SHA256 토큰 형식(sub/email/role/typ/exp)을
 * 사용한다. 같은 JWT_SECRET을 공유하므로 향후 Gateway 경유로 전환해도 그대로 통한다.
 */
@Component
public class AdminJwtTokenProvider {
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final ObjectMapper objectMapper;
    private final String secret;
    private final long accessExpirationMillis;

    public AdminJwtTokenProvider(
            ObjectMapper objectMapper,
            @Value("${brainx.jwt.secret}") String secret,
            @Value("${brainx.jwt.access-token-expiration-millis}") long accessExpirationMillis
    ) {
        this.objectMapper = objectMapper;
        this.secret = secret;
        this.accessExpirationMillis = accessExpirationMillis;
    }

    public String createAccessToken(AdminAccount admin) {
        try {
            Instant now = Instant.now();
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", admin.getAdminId());
            if (admin.getEmail() != null) {
                payload.put("email", admin.getEmail());
            }
            payload.put("role", admin.getRole().name().toUpperCase());
            payload.put("typ", "access");
            payload.put("iat", now.getEpochSecond());
            payload.put("exp", now.plusMillis(accessExpirationMillis).getEpochSecond());

            String encodedHeader = base64Url(objectMapper.writeValueAsBytes(header));
            String encodedPayload = base64Url(objectMapper.writeValueAsBytes(payload));
            String unsignedToken = encodedHeader + "." + encodedPayload;
            return unsignedToken + "." + sign(unsignedToken);
        } catch (Exception exception) {
            throw new IllegalStateException("토큰 생성에 실패했습니다.", exception);
        }
    }

    public boolean isValid(String token) {
        try {
            Map<String, Object> claims = claims(token);
            Number exp = (Number) claims.get("exp");
            return exp != null && exp.longValue() > Instant.now().getEpochSecond() && "access".equals(claims.get("typ"));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public String getAdminId(String token) {
        return (String) claims(token).get("sub");
    }

    public String getRole(String token) {
        return (String) claims(token).get("role");
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
        return base64Url(mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
    }

    private String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
