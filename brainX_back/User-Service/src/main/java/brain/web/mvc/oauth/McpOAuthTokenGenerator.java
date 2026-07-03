package brain.web.mvc.oauth;

import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class McpOAuthTokenGenerator {
    private final SecureRandom random = new SecureRandom();

    public String authorizationCode() {
        return "mcp_code_" + randomUrlToken(32);
    }

    public String refreshToken() {
        return "mcp_rfr_" + randomUrlToken(48);
    }

    public String clientId() {
        return "mcp_oauth_" + randomUrlToken(18);
    }

    private String randomUrlToken(int bytes) {
        byte[] buffer = new byte[bytes];
        random.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }
}
