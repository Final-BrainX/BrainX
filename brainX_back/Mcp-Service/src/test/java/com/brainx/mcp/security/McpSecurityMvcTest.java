package com.brainx.mcp.security;

import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brainx.mcp.client.persistence.McpApiClientRepository;
import com.brainx.mcp.support.JwtTestTokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "brainx.jwt.secret=test-jwt-secret-for-mcp-service",
    "brainx.oauth.issuer=http://localhost:3000",
    "brainx.oauth.resource=http://localhost:3000/mcp",
    "brainx.oauth.protected-resource-metadata-url=http://localhost:3000/.well-known/oauth-protected-resource"
})
class McpSecurityMvcTest {

    private static final String SECRET = "test-jwt-secret-for-mcp-service";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private McpApiClientRepository repository;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
    }

    @Test
    void createApiClientRequiresJwtAccessToken() throws Exception {
        mockMvc.perform(post("/api/v1/mcp/api-clients")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"Codex","scopes":["notes:read"]}
                    """))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/mcp/api-clients")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + JwtTestTokens.refreshToken(SECRET, "usr_1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"Codex","scopes":["notes:read"]}
                    """))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void validJwtCreatesApiClient() throws Exception {
        mockMvc.perform(post("/api/v1/mcp/api-clients")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + JwtTestTokens.accessToken(SECRET, "usr_1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"Codex","scopes":["notes:read","ai:search"]}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.clientId", startsWith("mcp_")))
            .andExpect(jsonPath("$.data.apiKeyOnce", startsWith("bxk_live_mcp_")));
    }

    @Test
    void whoamiRequiresApiKey() throws Exception {
        mockMvc.perform(get("/api/v1/mcp/whoami"))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/mcp/whoami")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + JwtTestTokens.accessToken(SECRET, "usr_1")))
            .andExpect(status().isForbidden());
    }

    @Test
    void protectedResourceMetadataIsPublic() throws Exception {
        mockMvc.perform(get("/.well-known/oauth-protected-resource"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.resource").value("http://localhost:3000/mcp"))
            .andExpect(jsonPath("$.authorization_servers[0]").value("http://localhost:3000"))
            .andExpect(jsonPath("$.scopes_supported[0]").value("whoami"));
    }

    @Test
    void validMcpOAuthTokenCanCallWhoami() throws Exception {
        mockMvc.perform(get("/api/v1/mcp/whoami")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + mcpOAuthToken()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.userId").value("usr_1"))
            .andExpect(jsonPath("$.data.clientId").value("mcp_oauth_1"))
            .andExpect(jsonPath("$.data.scopes[0]").value("whoami"));
    }

    @Test
    void validApiKeyCanCallWhoamiButCannotManageApiClients() throws Exception {
        String apiKey = createApiKey();

        mockMvc.perform(get("/api/v1/mcp/whoami")
                .header("X-BrainX-Api-Key", apiKey))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.userId").value("usr_1"))
            .andExpect(jsonPath("$.data.clientId", startsWith("mcp_")))
            .andExpect(jsonPath("$.data.scopes[0]").value("notes:read"));

        mockMvc.perform(delete("/api/v1/mcp/api-clients/mcp_any")
                .header("X-BrainX-Api-Key", apiKey))
            .andExpect(status().isForbidden());
    }

    @Test
    void apiKeyAuthenticationWinsWhenBrowserJwtHeaderIsAlsoPresent() throws Exception {
        String apiKey = createApiKey();

        mockMvc.perform(get("/api/v1/mcp/whoami")
                .header("X-BrainX-Api-Key", apiKey)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + JwtTestTokens.accessToken(SECRET, "usr_1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.userId").value("usr_1"))
            .andExpect(jsonPath("$.data.clientId", startsWith("mcp_")));
    }

    @Test
    void mcpEndpointIsProtected() throws Exception {
        mockMvc.perform(post("/mcp")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.WWW_AUTHENTICATE,
                containsString("resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource\"")
            ));
    }

    @Test
    void validApiKeyPassesMcpEndpointAuthentication() throws Exception {
        String apiKey = createApiKey();

        MvcResult result = mockMvc.perform(post("/mcp")
                .header("X-BrainX-Api-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andReturn();

        org.assertj.core.api.Assertions.assertThat(result.getResponse().getStatus()).isNotEqualTo(401);
    }

    @Test
    void validMcpOAuthTokenPassesMcpEndpointAuthentication() throws Exception {
        MvcResult result = mockMvc.perform(post("/mcp")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + mcpOAuthToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andReturn();

        org.assertj.core.api.Assertions.assertThat(result.getResponse().getStatus()).isNotEqualTo(401);
    }

    private String createApiKey() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/mcp/api-clients")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + JwtTestTokens.accessToken(SECRET, "usr_1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name":"Codex","scopes":["notes:read"]}
                    """))
            .andExpect(status().isOk())
            .andReturn();

        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.apiKeyOnce");
    }

    private String mcpOAuthToken() {
        return JwtTestTokens.mcpAccessToken(
            SECRET,
            "usr_1",
            "mcp_oauth_1",
            "whoami notes:read",
            "http://localhost:3000",
            "http://localhost:3000/mcp"
        );
    }
}
