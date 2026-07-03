package brain.web.mvc.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import brain.web.mvc.entity.User;
import brain.web.mvc.repository.UserRepository;
import brain.web.mvc.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:user_service_oauth;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "brainx.jwt.secret=test-jwt-secret-for-user-service-oauth",
    "brainx.mcp-oauth.issuer=http://localhost:3000",
    "brainx.mcp-oauth.resource=http://localhost:3000/mcp",
    "brainx.mcp-oauth.redirect-uri-allowlist=https://trusted.example.com/oauth/callback"
})
class McpOAuthMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private OAuthAuthorizationCodeRepository codeRepository;

    @Autowired
    private OAuthRefreshTokenRepository refreshTokenRepository;

    @Autowired
    private OAuthConsentRepository consentRepository;

    @Autowired
    private OAuthClientRepository clientRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private User user;
    private String accessToken;

    @BeforeEach
    void setUp() {
        codeRepository.deleteAll();
        refreshTokenRepository.deleteAll();
        consentRepository.deleteAll();
        clientRepository.deleteAll();
        userRepository.deleteAll();
        user = userRepository.save(User.builder()
            .email("mcp-oauth@example.com")
            .password("{noop}password")
            .nickname("MCP OAuth")
            .build());
        accessToken = jwtTokenProvider.createAccessToken(user, "sid_test");
    }

    @Test
    void dynamicClientRegistrationThenPkceCodeGrantAndRefresh() throws Exception {
        String clientId = registerClient();
        String verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
        String code = issueCode(clientId, verifier);

        MvcResult tokenResult = mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "authorization_code")
                .param("code", code)
                .param("redirect_uri", redirectUri())
                .param("client_id", clientId)
                .param("code_verifier", verifier)
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.access_token").isString())
            .andExpect(jsonPath("$.token_type").value("Bearer"))
            .andExpect(jsonPath("$.scope").value("whoami notes:read"))
            .andExpect(jsonPath("$.refresh_token").isString())
            .andReturn();

        String refreshToken = objectMapper.readTree(tokenResult.getResponse().getContentAsString()).get("refresh_token").asText();

        mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "refresh_token")
                .param("refresh_token", refreshToken)
                .param("client_id", clientId)
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.access_token").isString())
            .andExpect(jsonPath("$.refresh_token").isString());

        mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "refresh_token")
                .param("refresh_token", refreshToken)
                .param("client_id", clientId)
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_grant"));
    }

    @Test
    void codeCannotBeReusedAndPkceMustMatch() throws Exception {
        String clientId = registerClient();
        String verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
        String code = issueCode(clientId, verifier);

        mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "authorization_code")
                .param("code", code)
                .param("redirect_uri", redirectUri())
                .param("client_id", clientId)
                .param("code_verifier", "wrong-verifier")
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_grant"));

        mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "authorization_code")
                .param("code", code)
                .param("redirect_uri", redirectUri())
                .param("client_id", clientId)
                .param("code_verifier", verifier)
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isOk());

        mockMvc.perform(post("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "authorization_code")
                .param("code", code)
                .param("redirect_uri", redirectUri())
                .param("client_id", clientId)
                .param("code_verifier", verifier)
                .param("resource", "http://localhost:3000/mcp"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_grant"));
    }

    @Test
    void authorizationRequiresUserJwt() throws Exception {
        String clientId = registerClient();

        mockMvc.perform(post("/api/v1/oauth/authorizations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(authorizationPayload(clientId, challenge("verifier")))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void redirectUriAllowlistMatchesHostPortAndPathBoundary() throws Exception {
        registerClientWithRedirectUri("https://trusted.example.com/oauth/callback");
        registerClientWithRedirectUri("https://trusted.example.com/oauth/callback/codex");

        mockMvc.perform(post("/oauth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(clientRegistrationPayload(
                    "https://trusted.example.com.evil.test/oauth/callback"
                ))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_redirect_uri"));

        mockMvc.perform(post("/oauth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(clientRegistrationPayload(
                    "https://trusted.example.com/oauth/callbackevil"
                ))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_redirect_uri"));
    }

    private String registerClient() throws Exception {
        return registerClientWithRedirectUri(redirectUri());
    }

    private String registerClientWithRedirectUri(String redirectUri) throws Exception {
        MvcResult result = mockMvc.perform(post("/oauth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(clientRegistrationPayload(redirectUri))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.client_id").isString())
            .andExpect(jsonPath("$.token_endpoint_auth_method").value("none"))
            .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("client_id").asText();
    }

    private Map<String, Object> clientRegistrationPayload(String redirectUri) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("client_name", "Codex");
        payload.put("redirect_uris", java.util.List.of(redirectUri));
        payload.put("scope", "whoami notes:read");
        return payload;
    }

    private String issueCode(String clientId, String verifier) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/oauth/authorizations")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(authorizationPayload(clientId, challenge(verifier)))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.redirectTo").isString())
            .andReturn();

        String redirectTo = objectMapper.readTree(result.getResponse().getContentAsString())
            .get("data")
            .get("redirectTo")
            .asText();
        URI uri = URI.create(redirectTo);
        String code = Arrays.stream(uri.getRawQuery().split("&"))
            .map(part -> part.split("=", 2))
            .filter(parts -> parts.length == 2 && parts[0].equals("code"))
            .map(parts -> URLDecoder.decode(parts[1], StandardCharsets.UTF_8))
            .findFirst()
            .orElseThrow();
        assertThat(code).startsWith("mcp_code_");
        return code;
    }

    private Map<String, Object> authorizationPayload(String clientId, String challenge) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("clientId", clientId);
        payload.put("redirectUri", redirectUri());
        payload.put("scope", "whoami notes:read");
        payload.put("state", "state-1");
        payload.put("codeChallenge", challenge);
        payload.put("codeChallengeMethod", "S256");
        payload.put("resource", "http://localhost:3000/mcp");
        return payload;
    }

    private static String redirectUri() {
        return "http://127.0.0.1:39171/oauth/callback";
    }

    private static String challenge(String verifier) {
        try {
            byte[] hashed = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
