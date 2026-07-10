package com.brainx.intelligence.infrastructure.security;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

final class RuntimeSecretValidator {

    private static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "test", "dev-ui");

    private RuntimeSecretValidator() {
    }

    static String requireJwtSecret(String value, Environment environment) {
        return requireSecret(value, "JWT_SECRET", "replace_with_at_least_32_byte_secret", environment);
    }

    static String requireServiceToken(String value, Environment environment) {
        return requireSecret(value, "SERVICE_TOKEN", "local-service-token", environment);
    }

    private static String requireSecret(
        String value,
        String environmentVariable,
        String knownPlaceholder,
        Environment environment
    ) {
        String normalized = value == null ? "" : value.trim();
        boolean developmentProfile = DEVELOPMENT_PROFILES.stream()
            .anyMatch(profile -> environment.acceptsProfiles(Profiles.of(profile)));
        if (!developmentProfile) {
            if (normalized.isEmpty() || knownPlaceholder.equals(normalized)) {
                throw new IllegalStateException(environmentVariable + " must be configured with a non-placeholder value.");
            }
            if (normalized.getBytes(StandardCharsets.UTF_8).length < 32) {
                throw new IllegalStateException(environmentVariable + " must be at least 32 bytes.");
            }
        }
        return normalized;
    }
}
