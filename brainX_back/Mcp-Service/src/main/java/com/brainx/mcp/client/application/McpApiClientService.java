package com.brainx.mcp.client.application;

import com.brainx.mcp.api.ApiException;
import com.brainx.mcp.client.domain.IssuedApiKey;
import com.brainx.mcp.client.domain.McpApiClient;
import com.brainx.mcp.client.persistence.McpApiClientEntity;
import com.brainx.mcp.client.persistence.McpApiClientRepository;
import com.brainx.mcp.security.McpPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class McpApiClientService implements ApiKeyAuthenticator {

    private final McpApiClientRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final ApiKeyParser apiKeyParser;
    private final ApiKeyGenerator apiKeyGenerator;
    private final Clock clock;

    public McpApiClientService(
        McpApiClientRepository repository,
        PasswordEncoder passwordEncoder,
        ApiKeyParser apiKeyParser,
        ApiKeyGenerator apiKeyGenerator,
        Clock clock
    ) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.apiKeyParser = apiKeyParser;
        this.apiKeyGenerator = apiKeyGenerator;
        this.clock = clock;
    }

    @Transactional
    public IssuedApiKey create(String userId, String name, List<String> scopes, Instant expiresAt) {
        List<String> normalizedScopes = normalizeScopes(scopes);
        if (normalizedScopes.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCOPES", "At least one scope is required.");
        }
        if (expiresAt != null && !expiresAt.isAfter(clock.instant())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXPIRATION", "expiresAt must be in the future.");
        }

        String clientId = newUniqueClientId();
        String secret = apiKeyGenerator.newSecret();
        McpApiClientEntity entity = new McpApiClientEntity(
            clientId,
            userId,
            name.trim(),
            passwordEncoder.encode(secret),
            normalizedScopes,
            expiresAt,
            clock.instant()
        );
        repository.save(entity);
        return new IssuedApiKey(entity.toDomain(), apiKeyParser.format(clientId, secret));
    }

    @Transactional(readOnly = true)
    public List<McpApiClient> list(String userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .map(McpApiClientEntity::toDomain)
            .toList();
    }

    @Transactional
    public void revoke(String userId, String clientId) {
        McpApiClientEntity entity = repository.findById(clientId)
            .filter(candidate -> candidate.getUserId().equals(userId))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "API_CLIENT_NOT_FOUND", "API client not found."));
        if (entity.getRevokedAt() == null) {
            entity.revoke(clock.instant());
        }
    }

    @Override
    @Transactional
    public Optional<McpPrincipal> authenticate(String apiKey) {
        return apiKeyParser.parse(apiKey)
            .flatMap(parsed -> repository.findById(parsed.clientId())
                .filter(entity -> entity.getRevokedAt() == null)
                .filter(entity -> entity.getExpiresAt() == null || entity.getExpiresAt().isAfter(clock.instant()))
                .filter(entity -> passwordEncoder.matches(parsed.secret(), entity.getSecretHash()))
                .map(entity -> {
                    entity.markUsed(clock.instant());
                    McpApiClient client = entity.toDomain();
                    return new McpPrincipal(client.userId(), client.clientId(), client.scopes());
                }));
    }

    private String newUniqueClientId() {
        String clientId = apiKeyGenerator.newClientId();
        while (repository.existsById(clientId)) {
            clientId = apiKeyGenerator.newClientId();
        }
        return clientId;
    }

    private static List<String> normalizeScopes(List<String> scopes) {
        if (scopes == null) {
            return List.of();
        }
        return scopes.stream()
            .map(scope -> scope == null ? "" : scope.trim())
            .filter(scope -> !scope.isBlank())
            .distinct()
            .sorted(Comparator.naturalOrder())
            .toList();
    }
}
