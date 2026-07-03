package com.brainx.mcp.client.domain;

public record IssuedApiKey(
    McpApiClient client,
    String apiKeyOnce
) {
}
