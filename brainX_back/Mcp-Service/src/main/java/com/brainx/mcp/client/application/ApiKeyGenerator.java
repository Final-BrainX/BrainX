package com.brainx.mcp.client.application;

import java.security.SecureRandom;
import java.util.Base64;

public class ApiKeyGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String newClientId() {
        return "mcp_" + randomUrlToken(18);
    }

    public String newSecret() {
        return randomUrlToken(32);
    }

    private static String randomUrlToken(int byteLength) {
        byte[] bytes = new byte[byteLength];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
