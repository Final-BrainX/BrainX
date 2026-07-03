package brain.web.mvc.oauth;

import brain.web.mvc.dto.response.ApiResponse;
import brain.web.mvc.oauth.McpOAuthService.AuthorizationCodeResult;
import brain.web.mvc.oauth.McpOAuthService.AuthorizationRequest;
import brain.web.mvc.oauth.McpOAuthService.RegisterClientCommand;
import brain.web.mvc.oauth.McpOAuthService.RegisteredClient;
import brain.web.mvc.oauth.McpOAuthService.TokenRequest;
import brain.web.mvc.oauth.McpOAuthService.TokenResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class McpOAuthController {
    private final McpOAuthService oauthService;

    public McpOAuthController(McpOAuthService oauthService) {
        this.oauthService = oauthService;
    }

    @GetMapping({"/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"})
    public ResponseEntity<Map<String, Object>> metadata() {
        return ResponseEntity.ok(oauthService.authorizationServerMetadata());
    }

    @PostMapping("/oauth/register")
    public ResponseEntity<RegisterClientResponse> register(@Valid @RequestBody RegisterClientRequest request) {
        RegisteredClient client = oauthService.registerClient(new RegisterClientCommand(
            request.clientName(),
            request.redirectUris(),
            request.scope()
        ));
        return ResponseEntity.status(HttpStatus.CREATED).body(RegisterClientResponse.from(client));
    }

    @PostMapping(
        value = "/oauth/token",
        consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE
    )
    public ResponseEntity<TokenResponseBody> token(@RequestParam MultiValueMap<String, String> form) {
        String grantType = first(form, "grant_type");
        TokenRequest request = new TokenRequest(
            grantType,
            first(form, "code"),
            first(form, "refresh_token"),
            first(form, "redirect_uri"),
            first(form, "client_id"),
            first(form, "code_verifier"),
            first(form, "resource")
        );
        TokenResponse response = switch (grantType == null ? "" : grantType) {
            case "authorization_code" -> oauthService.exchangeAuthorizationCode(request);
            case "refresh_token" -> oauthService.refresh(request);
            default -> throw new McpOAuthException(HttpStatus.BAD_REQUEST, "unsupported_grant_type", "Unsupported grant_type.");
        };
        return ResponseEntity.ok(TokenResponseBody.from(response));
    }

    @PostMapping("/api/v1/oauth/authorizations")
    public ResponseEntity<ApiResponse<AuthorizationCodeResult>> authorize(@Valid @RequestBody AuthorizationRequestBody request) {
        AuthorizationCodeResult response = oauthService.createAuthorizationCode(new AuthorizationRequest(
            request.clientId(),
            request.redirectUri(),
            request.scope(),
            request.state(),
            request.codeChallenge(),
            request.codeChallengeMethod(),
            request.resource()
        ));
        return ResponseEntity.ok(ApiResponse.success(response, "MCP authorization code issued."));
    }

    private static String first(MultiValueMap<String, String> values, String key) {
        String value = values.getFirst(key);
        return value == null ? null : value.trim();
    }

    public record RegisterClientRequest(
        @JsonProperty("client_name") String clientName,
        @JsonProperty("redirect_uris") @NotEmpty(message = "redirect_uris is required.") List<@NotBlank String> redirectUris,
        String scope
    ) {
    }

    public record RegisterClientResponse(
        @JsonProperty("client_id") String clientId,
        @JsonProperty("client_name") String clientName,
        @JsonProperty("redirect_uris") List<String> redirectUris,
        String scope,
        @JsonProperty("grant_types") List<String> grantTypes,
        @JsonProperty("response_types") List<String> responseTypes,
        @JsonProperty("token_endpoint_auth_method") String tokenEndpointAuthMethod,
        @JsonProperty("client_id_issued_at") long clientIdIssuedAt
    ) {
        static RegisterClientResponse from(RegisteredClient client) {
            return new RegisterClientResponse(
                client.clientId(),
                client.clientName(),
                client.redirectUris(),
                client.scope(),
                List.of("authorization_code", "refresh_token"),
                List.of("code"),
                "none",
                java.time.Instant.now().getEpochSecond()
            );
        }
    }

    public record TokenResponseBody(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("token_type") String tokenType,
        @JsonProperty("expires_in") long expiresIn,
        String scope,
        @JsonProperty("refresh_token") String refreshToken
    ) {
        static TokenResponseBody from(TokenResponse response) {
            return new TokenResponseBody(
                response.accessToken(),
                response.tokenType(),
                response.expiresIn(),
                response.scope(),
                response.refreshToken()
            );
        }
    }

    public record AuthorizationRequestBody(
        String clientId,
        String redirectUri,
        String scope,
        String state,
        String codeChallenge,
        String codeChallengeMethod,
        String resource
    ) {
    }
}
