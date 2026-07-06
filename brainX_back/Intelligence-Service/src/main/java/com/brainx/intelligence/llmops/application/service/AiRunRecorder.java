package com.brainx.intelligence.llmops.application.service;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.LlmRunStatus;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;

@Service
public class AiRunRecorder {

    private static final String PROVIDER = "openai";
    private static final Pattern SECRET_PATTERN = Pattern.compile(
        "(?i)(sk-[A-Za-z0-9_\\-]{12,}|pa-[A-Za-z0-9_\\-]{12,}|bearer\\s+[A-Za-z0-9._\\-]+|api[_-]?key\\s*[:=]\\s*\\S+)"
    );

    private final LlmOpsStore store;
    private final AiTokenUsageCostEstimator costEstimator;
    private final LlmOpsProperties properties;

    public AiRunRecorder(
        LlmOpsStore store,
        AiTokenUsageCostEstimator costEstimator,
        LlmOpsProperties properties
    ) {
        this.store = store;
        this.costEstimator = costEstimator;
        this.properties = properties;
    }

    public RunHandle startChatRun(
        String userId,
        String featureId,
        String promptKey,
        String promptVersion,
        String modelId,
        String targetType,
        String targetId,
        List<AiChatMessage> messages,
        Map<String, Object> metadata
    ) {
        Instant startedAt = Instant.now();
        String runId = UUID.randomUUID().toString();
        LlmRun run = new LlmRun(
            runId,
            userId,
            featureId,
            targetType,
            targetId,
            promptKey,
            StringUtils.hasText(promptVersion) ? promptVersion : "code",
            modelId,
            PROVIDER,
            LlmRunStatus.RUNNING,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            inputPreview(messages),
            Map.of(),
            metadataPreview(metadata),
            null,
            null,
            startedAt,
            null
        );
        store.saveRun(run);
        return new RunHandle(runId, startedAt);
    }

    public AiChatResponse recordChatGenerate(
        String userId,
        String featureId,
        String promptKey,
        String promptVersion,
        String modelId,
        String targetType,
        String targetId,
        List<AiChatMessage> messages,
        Map<String, Object> metadata,
        Supplier<AiChatResponse> call
    ) {
        return recordChatGenerateWithRun(
            userId,
            featureId,
            promptKey,
            promptVersion,
            modelId,
            targetType,
            targetId,
            messages,
            metadata,
            call
        ).response();
    }

    public RecordedChatResponse recordChatGenerateWithRun(
        String userId,
        String featureId,
        String promptKey,
        String promptVersion,
        String modelId,
        String targetType,
        String targetId,
        List<AiChatMessage> messages,
        Map<String, Object> metadata,
        Supplier<AiChatResponse> call
    ) {
        RunHandle handle = startChatRun(userId, featureId, promptKey, promptVersion, modelId, targetType, targetId, messages, metadata);
        try {
            AiChatResponse response = call.get();
            complete(handle, modelId, response == null ? null : response.content(), response == null ? null : response.tokenUsage());
            return new RecordedChatResponse(handle.llmRunId(), response);
        } catch (RuntimeException exception) {
            fail(handle, exception);
            throw exception;
        }
    }

    public void complete(RunHandle handle, String modelId, String output, AiTokenUsage usage) {
        if (handle == null || !StringUtils.hasText(handle.llmRunId())) {
            return;
        }
        store.findRunById(handle.llmRunId()).ifPresent(run -> {
            int inputTokens = tokenCount(usage == null ? null : usage.promptTokens());
            int cachedTokens = Math.min(tokenCount(usage == null ? null : usage.cachedPromptTokens()), inputTokens);
            int outputTokens = tokenCount(usage == null ? null : usage.completionTokens());
            int reasoningTokens = tokenCount(usage == null ? null : usage.reasoningTokens());
            int totalTokens = usage == null || usage.totalTokens() == null
                ? inputTokens + outputTokens
                : Math.max(0, usage.totalTokens());
            TokenCostEstimate cost = costEstimator.estimate(
                StringUtils.hasText(run.modelId()) ? run.modelId() : modelId,
                inputTokens,
                cachedTokens,
                outputTokens
            );
            store.saveRun(run.succeeded(
                latencyMs(handle.startedAt()),
                inputTokens,
                cachedTokens,
                Math.max(0, inputTokens - cachedTokens),
                outputTokens,
                reasoningTokens,
                totalTokens,
                cost.inputCost(),
                cost.cachedInputCost(),
                cost.outputCost(),
                cost.totalCost(),
                cost.currencyCode(),
                outputPreview(output),
                Instant.now()
            ));
        });
    }

    public void fail(RunHandle handle, Exception exception) {
        if (handle == null || !StringUtils.hasText(handle.llmRunId())) {
            return;
        }
        store.findRunById(handle.llmRunId()).ifPresent(run -> store.saveRun(run.failed(
            latencyMs(handle.startedAt()),
            exception == null ? "LLM_RUN_FAILED" : exception.getClass().getSimpleName().toUpperCase(Locale.ROOT),
            safeMessage(exception),
            Instant.now()
        )));
    }

    private Map<String, Object> inputPreview(List<AiChatMessage> messages) {
        List<Map<String, Object>> items = messages == null ? List.of() : messages.stream()
            .map(message -> {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("role", message.role() == null ? null : message.role().name());
                values.put("contentPreview", preview(message.content()));
                return values;
            })
            .toList();
        return Map.of("messages", items);
    }

    private Map<String, Object> outputPreview(String output) {
        return Map.of("contentPreview", preview(output));
    }

    private Map<String, Object> metadataPreview(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> values = new LinkedHashMap<>();
        metadata.forEach((key, value) -> {
            if (key != null && value != null) {
                values.put(key, sanitizeValue(value));
            }
        });
        return values;
    }

    @SuppressWarnings("unchecked")
    private Object sanitizeValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> values = new LinkedHashMap<>();
            map.forEach((key, item) -> {
                if (key != null && item != null) {
                    values.put(key.toString(), sanitizeValue(item));
                }
            });
            return values;
        }
        if (value instanceof List<?> list) {
            return list.stream().map(this::sanitizeValue).toList();
        }
        if (value instanceof CharSequence text) {
            return preview(text.toString());
        }
        return value;
    }

    private String preview(String value) {
        String redacted = SECRET_PATTERN.matcher(value == null ? "" : value).replaceAll("[REDACTED]");
        int max = properties.getPreviewMaxChars();
        return redacted.length() <= max ? redacted : redacted.substring(0, max);
    }

    private static long latencyMs(Instant startedAt) {
        return Math.max(0, Duration.between(startedAt, Instant.now()).toMillis());
    }

    private static int tokenCount(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private static String safeMessage(Exception exception) {
        if (exception == null || !StringUtils.hasText(exception.getMessage())) {
            return "LLM run failed.";
        }
        return SECRET_PATTERN.matcher(exception.getMessage()).replaceAll("[REDACTED]");
    }

    public record RunHandle(String llmRunId, Instant startedAt) {
    }

    public record RecordedChatResponse(String llmRunId, AiChatResponse response) {
    }
}
