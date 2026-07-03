package brain.web.mvc.oauth;

import java.util.List;
import java.util.Set;

public final class McpOAuthConstants {
    public static final List<String> SUPPORTED_SCOPES = List.of("whoami", "notes:read", "ai:search", "notes:write");
    public static final Set<String> SUPPORTED_SCOPE_SET = Set.copyOf(SUPPORTED_SCOPES);
    public static final String TOKEN_TYPE = "Bearer";
    public static final String MCP_ACCESS_TOKEN_TYPE = "mcp_access";

    private McpOAuthConstants() {
    }
}
