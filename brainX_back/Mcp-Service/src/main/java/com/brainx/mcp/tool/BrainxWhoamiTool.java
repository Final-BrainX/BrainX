package com.brainx.mcp.tool;

import com.brainx.mcp.security.McpPrincipal;
import com.brainx.mcp.security.McpSecurity;
import java.util.List;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

@Component
public class BrainxWhoamiTool {

    @Tool(name = "brainx_whoami", description = "Return the authenticated BrainX MCP API client identity.")
    public WhoamiToolResult whoami() {
        McpPrincipal principal = McpSecurity.currentApiClient();
        return new WhoamiToolResult(principal.userId(), principal.clientId(), principal.scopes());
    }

    public record WhoamiToolResult(
        String userId,
        String clientId,
        List<String> scopes
    ) {
    }
}
