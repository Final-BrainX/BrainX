package brain.web.mvc.oauth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

public final class McpOAuthHashing {

    private McpOAuthHashing() {
    }

    public static String sha256Base64Url(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash OAuth value.", exception);
        }
    }
}
