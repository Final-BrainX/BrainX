package com.brainx.mcp.client.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brainx.mcp.api.ApiException;
import com.brainx.mcp.client.domain.IssuedApiKey;
import com.brainx.mcp.client.persistence.McpApiClientRepository;
import com.brainx.mcp.security.McpPrincipal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class McpApiClientServiceTest {

    @Autowired
    private McpApiClientService service;

    @Autowired
    private McpApiClientRepository repository;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
    }

    @Test
    void createDoesNotStoreRawApiKeyAndValidKeyAuthenticates() {
        IssuedApiKey issued = service.create("usr_1", "Codex", List.of("notes:read", "ai:search"), null);

        assertThat(issued.apiKeyOnce()).startsWith("bxk_live_" + issued.client().clientId() + ".");
        assertThat(repository.findById(issued.client().clientId()))
            .get()
            .satisfies(entity -> assertThat(entity.getSecretHash()).doesNotContain(issued.apiKeyOnce()));

        assertThat(service.authenticate(issued.apiKeyOnce()))
            .get()
            .extracting(McpPrincipal::userId, McpPrincipal::clientId)
            .containsExactly("usr_1", issued.client().clientId());
    }

    @Test
    void wrongKeyDoesNotAuthenticate() {
        IssuedApiKey issued = service.create("usr_1", "Codex", List.of("notes:read"), null);

        assertThat(service.authenticate(issued.apiKeyOnce() + "wrong")).isEmpty();
    }

    @Test
    void expiredKeyDoesNotAuthenticate() {
        assertThatThrownBy(() -> service.create("usr_1", "Expired", List.of("notes:read"), Instant.now().minusSeconds(1)))
            .isInstanceOf(ApiException.class);
    }

    @Test
    void revokedKeyDoesNotAuthenticate() {
        IssuedApiKey issued = service.create("usr_1", "Codex", List.of("notes:read"), null);

        service.revoke("usr_1", issued.client().clientId());

        assertThat(service.authenticate(issued.apiKeyOnce())).isEmpty();
    }
}
