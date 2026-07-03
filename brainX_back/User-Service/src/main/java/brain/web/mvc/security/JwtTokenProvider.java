package brain.web.mvc.security;

import brain.web.mvc.entity.User;
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
import java.util.List;
import java.util.Map;

@Component
public class JwtTokenProvider {
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final ObjectMapper objectMapper;
    private final String secret;
    private final long accessExpirationMillis;
    private final long refreshExpirationMillis;

    public JwtTokenProvider(
            ObjectMapper objectMapper,
            @Value("${brainx.jwt.secret}") String secret,
            @Value("${brainx.jwt.access-token-expiration-millis}") long accessExpirationMillis,
            @Value("${brainx.jwt.refresh-token-expiration-millis}") long refreshExpirationMillis
    ) {
        this.objectMapper = objectMapper;
        this.secret = secret;
        this.accessExpirationMillis = accessExpirationMillis;
        this.refreshExpirationMillis = refreshExpirationMillis;
    }

    public String createAccessToken(User user, String sessionId) {
        return createToken(user, accessExpirationMillis, "access", sessionId);
    }

    public String createRefreshToken(User user, String sessionId) {
        return createToken(user, refreshExpirationMillis, "refresh", sessionId);
    }

    public String createMcpAccessToken(
            User user,
            String clientId,
            List<String> scopes,
            String issuer,
            String resource,
            long expirationMillis
    ) {
        try {
            Instant now = Instant.now();
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", user.getUserId());
            payload.put("email", user.getEmail());
            payload.put("role", user.getRole().name());
            payload.put("typ", "mcp_access");
            payload.put("client_id", clientId);
            payload.put("scope", String.join(" ", scopes == null ? List.of() : scopes));
            payload.put("iss", issuer);
            payload.put("aud", resource);
            payload.put("resource", resource);
            payload.put("iat", now.getEpochSecond());
            payload.put("exp", now.plusMillis(expirationMillis).getEpochSecond());

            String encodedHeader = base64Url(objectMapper.writeValueAsBytes(header));
            String encodedPayload = base64Url(objectMapper.writeValueAsBytes(payload));
            String unsignedToken = encodedHeader + "." + encodedPayload;
            return unsignedToken + "." + sign(unsignedToken);
        } catch (Exception exception) {
            throw new IllegalStateException("MCP 토큰 생성에 실패했습니다.", exception);
        }
    }

    public long refreshExpirationMillis() {
        return refreshExpirationMillis;
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

    public String getSessionId(String token) {
        Object sessionId = claims(token).get("sid");
        return sessionId == null ? null : String.valueOf(sessionId);
    }

    private String createToken(User user, long expirationMillis, String type, String sessionId) {
        try {
            Instant now = Instant.now();
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", user.getUserId());
            payload.put("email", user.getEmail());
            payload.put("role", user.getRole().name());
            payload.put("typ", type);
            if (sessionId != null) {
                payload.put("sid", sessionId);
            }
            payload.put("iat", now.getEpochSecond());
            payload.put("exp", now.plusMillis(expirationMillis).getEpochSecond());

            String encodedHeader = base64Url(objectMapper.writeValueAsBytes(header));
            String encodedPayload = base64Url(objectMapper.writeValueAsBytes(payload));
            String unsignedToken = encodedHeader + "." + encodedPayload;
            return unsignedToken + "." + sign(unsignedToken);
        } catch (Exception exception) {
            throw new IllegalStateException("토큰 생성에 실패했습니다.", exception);
        }
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
