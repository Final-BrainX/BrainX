package com.brainx.mcp.client.web;

import com.brainx.mcp.api.ApiResponse;
import com.brainx.mcp.client.application.McpApiClientService;
import com.brainx.mcp.client.domain.IssuedApiKey;
import com.brainx.mcp.client.domain.McpApiClient;
import com.brainx.mcp.security.McpSecurity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.time.Instant;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class McpApiClientController {

    private final McpApiClientService apiClientService;

    public McpApiClientController(McpApiClientService apiClientService) {
        this.apiClientService = apiClientService;
    }

    @PostMapping("/api/v1/mcp/api-clients")
    public ResponseEntity<ApiResponse<CreateApiClientData>> create(@Valid @RequestBody CreateApiClientRequest request) {
        IssuedApiKey issued = apiClientService.create(
            McpSecurity.currentUserId(),
            request.name(),
            request.scopes(),
            request.expiresAt()
        );
        McpApiClient client = issued.client();
        return ResponseEntity.ok(ApiResponse.success(
            new CreateApiClientData(client.clientId(), issued.apiKeyOnce()),
            "API client created."
        ));
    }

    @GetMapping("/api/v1/mcp/api-clients")
    public ResponseEntity<ApiResponse<ApiClientListData>> list() {
        List<ApiClientItem> clients = apiClientService.list(McpSecurity.currentUserId())
            .stream()
            .map(ApiClientItem::from)
            .toList();
        return ResponseEntity.ok(ApiResponse.success(new ApiClientListData(clients), "API clients retrieved."));
    }

    @DeleteMapping("/api/v1/mcp/api-clients/{clientId}")
    public ResponseEntity<ApiResponse<Void>> revoke(@PathVariable String clientId) {
        apiClientService.revoke(McpSecurity.currentUserId(), clientId);
        return ResponseEntity.ok(ApiResponse.success(null, "API client revoked."));
    }

    public record CreateApiClientRequest(
        @NotBlank(message = "name is required.") String name,
        @NotEmpty(message = "scopes are required.") List<@NotBlank(message = "scope must not be blank.") String> scopes,
        Instant expiresAt
    ) {
    }

    public record CreateApiClientData(
        String clientId,
        String apiKeyOnce
    ) {
    }

    public record ApiClientListData(
        List<ApiClientItem> clients
    ) {
    }

    public record ApiClientItem(
        String clientId,
        String name,
        List<String> scopes,
        Instant expiresAt,
        Instant revokedAt,
        Instant lastUsedAt,
        Instant createdAt
    ) {
        static ApiClientItem from(McpApiClient client) {
            return new ApiClientItem(
                client.clientId(),
                client.name(),
                client.scopes(),
                client.expiresAt(),
                client.revokedAt(),
                client.lastUsedAt(),
                client.createdAt()
            );
        }
    }
}
