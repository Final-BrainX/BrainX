package com.brainx.intelligence.llmops.application.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.PromptDefinition;
import com.brainx.intelligence.llmops.domain.PromptVersion;
import com.brainx.intelligence.llmops.domain.PromptVersionStatus;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;

@Service
public class PromptRegistryService {

    private final LlmOpsStore store;

    public PromptRegistryService(LlmOpsStore store) {
        this.store = store;
    }

    public PromptResolution resolve(String promptKey, String codePrompt) {
        String normalizedKey = normalizeKey(promptKey);
        return store.findActivePromptVersion(normalizedKey)
            .map(version -> new PromptResolution(normalizedKey, String.valueOf(version.version()), version.template()))
            .orElseGet(() -> new PromptResolution(normalizedKey, "code", codePrompt == null ? "" : codePrompt));
    }

    public PromptDefinition saveDefinition(String promptKey, String featureId, String description, Map<String, Object> variableSchema) {
        return store.savePromptDefinition(new PromptDefinition(
            normalizeKey(promptKey),
            normalize(featureId),
            normalize(description),
            variableSchema,
            Instant.now(),
            Instant.now()
        ));
    }

    public PromptVersion createVersion(String promptKey, Integer version, String template, Map<String, Object> variableSchema) {
        String key = normalizeKey(promptKey);
        int nextVersion = version == null || version <= 0 ? (int) (System.currentTimeMillis() / 1000L) : version;
        return store.savePromptVersion(new PromptVersion(
            key + ":" + nextVersion,
            key,
            nextVersion,
            PromptVersionStatus.DRAFT,
            requireText(template, "template"),
            variableSchema,
            Instant.now(),
            null
        ));
    }

    public PromptVersion activateVersion(String promptKey, int version) {
        return store.activatePromptVersion(normalizeKey(promptKey), version)
            .orElseThrow(() -> new LlmOpsNotFoundException("Prompt version not found."));
    }

    public List<PromptDefinition> listDefinitions() {
        return store.listPromptDefinitions();
    }

    private static String normalizeKey(String promptKey) {
        return requireText(promptKey, "promptKey");
    }

    private static String requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    public record PromptResolution(String promptKey, String version, String template) {
        public String content() {
            return template;
        }
    }
}
