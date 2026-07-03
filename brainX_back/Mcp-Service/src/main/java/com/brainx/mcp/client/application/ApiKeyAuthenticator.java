package com.brainx.mcp.client.application;

import com.brainx.mcp.security.McpPrincipal;
import java.util.Optional;

public interface ApiKeyAuthenticator {

    Optional<McpPrincipal> authenticate(String apiKey);
}
