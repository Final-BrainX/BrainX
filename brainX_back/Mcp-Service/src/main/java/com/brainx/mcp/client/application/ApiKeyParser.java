package com.brainx.mcp.client.application;

import java.util.Optional;

public class ApiKeyParser {

    private final String prefix;

    public ApiKeyParser(String prefix) {
        this.prefix = prefix;
    }

    public Optional<ParsedApiKey> parse(String apiKey) {
        if (apiKey == null || !apiKey.startsWith(prefix)) {
            return Optional.empty();
        }
        int separator = apiKey.lastIndexOf('.');
        if (separator <= prefix.length() || separator == apiKey.length() - 1) {
            return Optional.empty();
        }
        String clientId = apiKey.substring(prefix.length(), separator);
        String secret = apiKey.substring(separator + 1);
        if (clientId.isBlank() || secret.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new ParsedApiKey(clientId, secret));
    }

    public String format(String clientId, String secret) {
        return prefix + clientId + "." + secret;
    }

    public record ParsedApiKey(String clientId, String secret) {
    }
}
