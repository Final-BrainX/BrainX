package brain.web.mvc.oauth;

import brain.web.mvc.entity.User;
import brain.web.mvc.repository.UserRepository;
import brain.web.mvc.security.JwtTokenProvider;
import java.net.URI;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class McpOAuthService {
    private final OAuthClientRepository clientRepository;
    private final OAuthAuthorizationCodeRepository codeRepository;
    private final OAuthRefreshTokenRepository refreshTokenRepository;
    private final OAuthConsentRepository consentRepository;
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final McpOAuthTokenGenerator tokenGenerator;
    private final String issuer;
    private final String resource;
    private final long codeTtlSeconds;
    private final long accessExpirationMillis;
    private final long refreshExpirationMillis;
    private final List<String> redirectUriAllowlist;

    public McpOAuthService(
        OAuthClientRepository clientRepository,
        OAuthAuthorizationCodeRepository codeRepository,
        OAuthRefreshTokenRepository refreshTokenRepository,
        OAuthConsentRepository consentRepository,
        UserRepository userRepository,
        JwtTokenProvider jwtTokenProvider,
        McpOAuthTokenGenerator tokenGenerator,
        @Value("${brainx.mcp-oauth.issuer}") String issuer,
        @Value("${brainx.mcp-oauth.resource}") String resource,
        @Value("${brainx.mcp-oauth.authorization-code-ttl-seconds}") long codeTtlSeconds,
        @Value("${brainx.mcp-oauth.access-token-expiration-millis}") long accessExpirationMillis,
        @Value("${brainx.mcp-oauth.refresh-token-expiration-millis}") long refreshExpirationMillis,
        @Value("${brainx.mcp-oauth.redirect-uri-allowlist:}") String redirectUriAllowlist
    ) {
        this.clientRepository = clientRepository;
        this.codeRepository = codeRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.consentRepository = consentRepository;
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.tokenGenerator = tokenGenerator;
        this.issuer = stripTrailingSlash(issuer);
        this.resource = stripTrailingSlash(resource);
        this.codeTtlSeconds = codeTtlSeconds;
        this.accessExpirationMillis = accessExpirationMillis;
        this.refreshExpirationMillis = refreshExpirationMillis;
        this.redirectUriAllowlist = splitSpaceOrComma(redirectUriAllowlist);
    }

    public Map<String, Object> authorizationServerMetadata() {
        return Map.ofEntries(
            Map.entry("issuer", issuer),
            Map.entry("authorization_endpoint", issuer + "/oauth/authorize"),
            Map.entry("token_endpoint", issuer + "/oauth/token"),
            Map.entry("registration_endpoint", issuer + "/oauth/register"),
            Map.entry("response_types_supported", List.of("code")),
            Map.entry("grant_types_supported", List.of("authorization_code", "refresh_token")),
            Map.entry("token_endpoint_auth_methods_supported", List.of("none")),
            Map.entry("code_challenge_methods_supported", List.of("S256")),
            Map.entry("scopes_supported", McpOAuthConstants.SUPPORTED_SCOPES)
        );
    }

    @Transactional
    public RegisteredClient registerClient(RegisterClientCommand command) {
        List<String> redirectUris = command.redirectUris().stream()
            .map(String::trim)
            .filter(uri -> !uri.isBlank())
            .distinct()
            .toList();
        if (redirectUris.isEmpty()) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_redirect_uri", "redirect_uris is required.");
        }
        for (String redirectUri : redirectUris) {
            validateRedirectUriForRegistration(redirectUri);
        }

        List<String> scopes = normalizeScopes(command.scope());
        if (scopes.isEmpty()) {
            scopes = McpOAuthConstants.SUPPORTED_SCOPES;
        }

        String clientId = tokenGenerator.clientId();
        OAuthClientEntity client = clientRepository.save(new OAuthClientEntity(
            clientId,
            StringUtils.hasText(command.clientName()) ? command.clientName().trim() : "BrainX MCP Client",
            redirectUris,
            scopes
        ));
        return RegisteredClient.from(client);
    }

    @Transactional
    public AuthorizationCodeResult createAuthorizationCode(AuthorizationRequest request) {
        User user = currentUser();
        OAuthClientEntity client = clientRepository.findById(requireText(request.clientId(), "client_id"))
            .orElseThrow(() -> oauth(HttpStatus.BAD_REQUEST, "invalid_client", "Unknown client_id."));
        String redirectUri = requireText(request.redirectUri(), "redirect_uri");
        if (!client.redirectUriList().contains(redirectUri)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_redirect_uri", "redirect_uri is not registered for this client.");
        }
        String resolvedResource = normalizeResource(request.resource());
        requireSupportedResource(resolvedResource);
        requireS256(request.codeChallenge(), request.codeChallengeMethod());

        List<String> scopes = normalizeScopes(request.scope());
        if (scopes.isEmpty()) {
            scopes = client.scopeList();
        }
        requireClientScopes(client, scopes);

        String code = tokenGenerator.authorizationCode();
        OAuthAuthorizationCodeEntity entity = new OAuthAuthorizationCodeEntity(
            McpOAuthHashing.sha256Base64Url(code),
            user,
            client.getClientId(),
            redirectUri,
            resolvedResource,
            scopes,
            request.codeChallenge().trim(),
            "S256",
            LocalDateTime.now().plusSeconds(codeTtlSeconds)
        );
        codeRepository.save(entity);
        upsertConsent(user.getUserId(), client.getClientId(), scopes);

        String redirectTo = UriComponentsBuilder.fromUriString(redirectUri)
            .queryParam("code", code)
            .queryParamIfPresent("state", StringUtils.hasText(request.state()) ? java.util.Optional.of(request.state()) : java.util.Optional.empty())
            .build()
            .toUriString();
        return new AuthorizationCodeResult(redirectTo, entity.getExpiresAt().toInstant(ZoneOffset.UTC).toString());
    }

    @Transactional
    public TokenResponse exchangeAuthorizationCode(TokenRequest request) {
        String code = requireText(request.code(), "code");
        OAuthAuthorizationCodeEntity stored = codeRepository.findByCodeHashForUpdate(McpOAuthHashing.sha256Base64Url(code))
            .orElseThrow(() -> oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "Authorization code is invalid."));
        LocalDateTime now = LocalDateTime.now();
        if (!stored.isUsable(now)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "Authorization code is expired or already used.");
        }
        if (!stored.getClientId().equals(requireText(request.clientId(), "client_id"))) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "client_id does not match authorization code.");
        }
        if (!stored.getRedirectUri().equals(requireText(request.redirectUri(), "redirect_uri"))) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "redirect_uri does not match authorization code.");
        }
        if (!stored.getResource().equals(normalizeResource(request.resource()))) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_target", "resource does not match authorization code.");
        }
        verifyPkce(stored, requireText(request.codeVerifier(), "code_verifier"));
        stored.consume();
        return issueTokenPair(stored.getUser(), stored.getClientId(), stored.getResource(), stored.scopeList());
    }

    @Transactional
    public TokenResponse refresh(TokenRequest request) {
        String token = requireText(request.refreshToken(), "refresh_token");
        OAuthRefreshTokenEntity stored = refreshTokenRepository.findByTokenHashForUpdate(McpOAuthHashing.sha256Base64Url(token))
            .orElseThrow(() -> oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "refresh_token is invalid."));
        if (!stored.isUsable(LocalDateTime.now())) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "refresh_token is expired or revoked.");
        }
        if (!stored.getClientId().equals(requireText(request.clientId(), "client_id"))) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "client_id does not match refresh_token.");
        }
        if (!stored.getResource().equals(normalizeResource(request.resource()))) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_target", "resource does not match refresh_token.");
        }

        String nextRefresh = tokenGenerator.refreshToken();
        String nextHash = McpOAuthHashing.sha256Base64Url(nextRefresh);
        stored.rotateTo(nextHash);
        OAuthRefreshTokenEntity next = new OAuthRefreshTokenEntity(
            nextHash,
            stored.getUser(),
            stored.getClientId(),
            stored.getResource(),
            stored.scopeList(),
            LocalDateTime.now().plusNanos(refreshExpirationMillis * 1_000_000)
        );
        refreshTokenRepository.save(next);
        return issueAccessToken(stored.getUser(), stored.getClientId(), stored.getResource(), stored.scopeList(), nextRefresh);
    }

    private TokenResponse issueTokenPair(User user, String clientId, String resource, List<String> scopes) {
        String refresh = tokenGenerator.refreshToken();
        OAuthRefreshTokenEntity storedRefresh = new OAuthRefreshTokenEntity(
            McpOAuthHashing.sha256Base64Url(refresh),
            user,
            clientId,
            resource,
            scopes,
            LocalDateTime.now().plusNanos(refreshExpirationMillis * 1_000_000)
        );
        refreshTokenRepository.save(storedRefresh);
        return issueAccessToken(user, clientId, resource, scopes, refresh);
    }

    private TokenResponse issueAccessToken(User user, String clientId, String resource, List<String> scopes, String refreshToken) {
        String accessToken = jwtTokenProvider.createMcpAccessToken(
            user,
            clientId,
            scopes,
            issuer,
            resource,
            accessExpirationMillis
        );
        return new TokenResponse(
            accessToken,
            McpOAuthConstants.TOKEN_TYPE,
            Math.max(1, accessExpirationMillis / 1000),
            String.join(" ", scopes),
            refreshToken
        );
    }

    private void verifyPkce(OAuthAuthorizationCodeEntity stored, String codeVerifier) {
        if (!"S256".equals(stored.getCodeChallengeMethod())) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "Unsupported code_challenge_method.");
        }
        String expected = McpOAuthHashing.sha256Base64Url(codeVerifier);
        if (!MessageDigestHolder.equals(expected, stored.getCodeChallenge())) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_grant", "code_verifier does not match.");
        }
    }

    private void upsertConsent(String userId, String clientId, List<String> scopes) {
        String consentId = userId + ":" + clientId;
        OAuthConsentEntity consent = consentRepository.findById(consentId)
            .orElseGet(() -> new OAuthConsentEntity(userId, clientId, scopes));
        consent.updateScopes(scopes);
        consentRepository.save(consent);
    }

    private User currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !StringUtils.hasText(authentication.getName())) {
            throw oauth(HttpStatus.UNAUTHORIZED, "login_required", "BrainX login is required.");
        }
        return userRepository.findById(authentication.getName())
            .orElseThrow(() -> oauth(HttpStatus.UNAUTHORIZED, "login_required", "BrainX user was not found."));
    }

    private void validateRedirectUriForRegistration(String redirectUri) {
        URI uri;
        try {
            uri = URI.create(redirectUri);
        } catch (IllegalArgumentException exception) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_redirect_uri", "redirect_uri is invalid.");
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_redirect_uri", "redirect_uri must be absolute.");
        }
        boolean loopback = isLoopbackRedirectUri(uri, scheme, host);
        boolean allowlisted = redirectUriAllowlist.stream()
            .anyMatch(allowed -> isAllowlistedRedirectUri(uri, allowed));
        if (!loopback && !allowlisted) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_redirect_uri", "Only loopback redirect URIs are allowed for public MCP clients.");
        }
    }

    private static boolean isLoopbackRedirectUri(URI uri, String scheme, String host) {
        return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
            && uri.getRawUserInfo() == null
            && (host.equalsIgnoreCase("localhost") || host.equals("127.0.0.1") || host.equals("::1"));
    }

    private static boolean isAllowlistedRedirectUri(URI redirectUri, String allowedValue) {
        if (!StringUtils.hasText(allowedValue)) {
            return false;
        }
        URI allowedUri;
        try {
            allowedUri = URI.create(allowedValue.trim());
        } catch (IllegalArgumentException exception) {
            return false;
        }
        if (!sameSchemeHostAndPort(redirectUri, allowedUri)) {
            return false;
        }
        if (redirectUri.getRawUserInfo() != null || allowedUri.getRawUserInfo() != null) {
            return false;
        }
        return pathMatchesAllowlist(redirectUri.getPath(), allowedUri.getPath());
    }

    private static boolean sameSchemeHostAndPort(URI redirectUri, URI allowedUri) {
        String redirectScheme = redirectUri.getScheme();
        String allowedScheme = allowedUri.getScheme();
        String redirectHost = redirectUri.getHost();
        String allowedHost = allowedUri.getHost();
        return StringUtils.hasText(redirectScheme)
            && StringUtils.hasText(allowedScheme)
            && StringUtils.hasText(redirectHost)
            && StringUtils.hasText(allowedHost)
            && redirectScheme.equalsIgnoreCase(allowedScheme)
            && redirectHost.equalsIgnoreCase(allowedHost)
            && effectivePort(redirectUri) == effectivePort(allowedUri);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        String scheme = uri.getScheme();
        if ("http".equalsIgnoreCase(scheme)) {
            return 80;
        }
        if ("https".equalsIgnoreCase(scheme)) {
            return 443;
        }
        return -1;
    }

    private static boolean pathMatchesAllowlist(String redirectPath, String allowedPath) {
        String requested = normalizeUriPath(redirectPath);
        String allowed = normalizeUriPath(allowedPath);
        if ("/".equals(allowed) || requested.equals(allowed)) {
            return true;
        }
        String prefix = allowed.endsWith("/") ? allowed : allowed + "/";
        return requested.startsWith(prefix);
    }

    private static String normalizeUriPath(String path) {
        if (!StringUtils.hasText(path)) {
            return "/";
        }
        String normalized = path.startsWith("/") ? path : "/" + path;
        while (normalized.endsWith("/") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private List<String> normalizeScopes(String scope) {
        List<String> requested = splitSpaceOrComma(scope);
        if (requested.isEmpty()) {
            return List.of();
        }
        Set<String> unique = new LinkedHashSet<>(requested);
        for (String item : unique) {
            if (!McpOAuthConstants.SUPPORTED_SCOPE_SET.contains(item)) {
                throw oauth(HttpStatus.BAD_REQUEST, "invalid_scope", "Unsupported scope: " + item);
            }
        }
        return List.copyOf(unique);
    }

    private void requireClientScopes(OAuthClientEntity client, List<String> scopes) {
        if (!client.scopeList().containsAll(scopes)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_scope", "Requested scope is not registered for this client.");
        }
    }

    private void requireSupportedResource(String requestedResource) {
        if (!resource.equals(requestedResource)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_target", "Unsupported MCP resource.");
        }
    }

    private String normalizeResource(String requestedResource) {
        return StringUtils.hasText(requestedResource) ? stripTrailingSlash(requestedResource.trim()) : resource;
    }

    private void requireS256(String codeChallenge, String method) {
        requireText(codeChallenge, "code_challenge");
        if (!"S256".equals(method)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_request", "code_challenge_method must be S256.");
        }
    }

    private String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw oauth(HttpStatus.BAD_REQUEST, "invalid_request", name + " is required.");
        }
        return value.trim();
    }

    private static List<String> splitSpaceOrComma(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        return Arrays.stream(value.split("[\\s,]+"))
            .map(String::trim)
            .filter(item -> !item.isBlank())
            .toList();
    }

    private static String stripTrailingSlash(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String trimmed = value.trim();
        while (trimmed.endsWith("/") && trimmed.length() > 1) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private McpOAuthException oauth(HttpStatus status, String error, String description) {
        return new McpOAuthException(status, error, description);
    }

    public record RegisterClientCommand(
        String clientName,
        List<String> redirectUris,
        String scope
    ) {
    }

    public record RegisteredClient(
        String clientId,
        String clientName,
        List<String> redirectUris,
        String scope
    ) {
        static RegisteredClient from(OAuthClientEntity client) {
            return new RegisteredClient(
                client.getClientId(),
                client.getClientName(),
                client.redirectUriList(),
                String.join(" ", client.scopeList())
            );
        }
    }

    public record AuthorizationRequest(
        String clientId,
        String redirectUri,
        String scope,
        String state,
        String codeChallenge,
        String codeChallengeMethod,
        String resource
    ) {
    }

    public record AuthorizationCodeResult(
        String redirectTo,
        String expiresAt
    ) {
    }

    public record TokenRequest(
        String grantType,
        String code,
        String refreshToken,
        String redirectUri,
        String clientId,
        String codeVerifier,
        String resource
    ) {
    }

    public record TokenResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        String scope,
        String refreshToken
    ) {
    }

    private static final class MessageDigestHolder {
        private static boolean equals(String left, String right) {
            return java.security.MessageDigest.isEqual(
                left.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                right.getBytes(java.nio.charset.StandardCharsets.UTF_8)
            );
        }
    }
}
