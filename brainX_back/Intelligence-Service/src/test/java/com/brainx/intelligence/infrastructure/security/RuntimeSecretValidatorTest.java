package com.brainx.intelligence.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class RuntimeSecretValidatorTest {

    @Test
    void rejectsMissingAndKnownPlaceholderSecretsOutsideDevelopmentProfiles() {
        MockEnvironment environment = new MockEnvironment();

        assertThatThrownBy(() -> RuntimeSecretValidator.requireJwtSecret("", environment))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT_SECRET");
        assertThatThrownBy(() -> RuntimeSecretValidator.requireServiceToken("local-service-token", environment))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("SERVICE_TOKEN");
    }

    @Test
    void rejectsShortSecretsOutsideDevelopmentProfiles() {
        MockEnvironment environment = new MockEnvironment();

        assertThatThrownBy(() -> RuntimeSecretValidator.requireJwtSecret("short-jwt-secret", environment))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("32 bytes");
        assertThatThrownBy(() -> RuntimeSecretValidator.requireServiceToken("short-service-token", environment))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("32 bytes");
    }

    @Test
    void acceptsConfiguredSecretsAndDevelopmentProfiles() {
        MockEnvironment production = new MockEnvironment();
        MockEnvironment local = new MockEnvironment().withProperty("spring.profiles.active", "local");
        local.setActiveProfiles("local");

        String configuredSecret = "configured-secret-with-at-least-32-bytes";
        assertThat(RuntimeSecretValidator.requireJwtSecret(configuredSecret, production))
            .isEqualTo(configuredSecret);
        assertThat(RuntimeSecretValidator.requireServiceToken(configuredSecret, production))
            .isEqualTo(configuredSecret);
        assertThat(RuntimeSecretValidator.requireServiceToken("local-service-token", local))
            .isEqualTo("local-service-token");
    }
}
