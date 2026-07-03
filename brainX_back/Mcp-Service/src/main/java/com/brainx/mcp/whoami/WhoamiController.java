package com.brainx.mcp.whoami;

import com.brainx.mcp.api.ApiResponse;
import com.brainx.mcp.security.McpPrincipal;
import com.brainx.mcp.security.McpSecurity;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WhoamiController {

    @GetMapping("/api/v1/mcp/whoami")
    public ResponseEntity<ApiResponse<WhoamiData>> whoami() {
        McpPrincipal principal = McpSecurity.currentApiClient();
        return ResponseEntity.ok(ApiResponse.success(
            new WhoamiData(principal.userId(), principal.clientId(), principal.scopes()),
            "MCP API client authenticated."
        ));
    }

    public record WhoamiData(
        String userId,
        String clientId,
        List<String> scopes
    ) {
    }
}
