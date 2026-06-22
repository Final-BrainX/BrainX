package com.brainx.intelligence.assist.application.usecase;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionCreatedEvent;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort.AiSuggestionDecisionRecordedEvent;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;

@Service
public class AssistService implements CreateInlineAssistUseCase, DecideAiSuggestionUseCase {

    static final String INLINE_ASSIST_CAPABILITY = "INLINE_ASSIST";
    static final String INLINE_ASSIST_FEATURE_ID = "inline-assist-chat";
    private static final String SOURCE_SERVICE = "AI-Service";
    private static final String DEFAULT_LANGUAGE = "ko";

    private final AssistProperties properties;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final EntitlementPort entitlementPort;
    private final AiChatPort aiChatPort;
    private final TokenUsagePort tokenUsagePort;
    private final AiTokenUsageCostEstimator usageCostEstimator;
    private final AssistEventPort assistEventPort;

    public AssistService(
        AssistProperties properties,
        AiModelSettingsPort aiModelSettingsPort,
        EntitlementPort entitlementPort,
        AiChatPort aiChatPort,
        TokenUsagePort tokenUsagePort,
        AiTokenUsageCostEstimator usageCostEstimator,
        AssistEventPort assistEventPort
    ) {
        this.properties = properties;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.entitlementPort = entitlementPort;
        this.aiChatPort = aiChatPort;
        this.tokenUsagePort = tokenUsagePort;
        this.usageCostEstimator = usageCostEstimator;
        this.assistEventPort = assistEventPort;
    }

    @Override
    public InlineAssistResult createInlineAssist(InlineAssistCommand command) {
        String userId = requireText(command.userId(), "userId");
        String noteId = requireText(command.noteId(), "noteId");
        InlineAssistAction action = requireAction(command.action());
        String selectedText = normalize(command.selectedText());
        String contextBefore = normalize(command.contextBefore());
        String contextAfter = normalize(command.contextAfter());
        String language = StringUtils.hasText(command.language()) ? command.language().trim() : DEFAULT_LANGUAGE;
        validateInput(action, selectedText, contextBefore, contextAfter);

        String modelId = resolveModelId(userId);
        String systemPrompt = systemPrompt();
        String userPrompt = userPrompt(action, language, selectedText, contextBefore, contextAfter);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            INLINE_ASSIST_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new IllegalArgumentException("AI capability is not available: " + entitlement.reasonCode());
        }

        var response = aiChatPort.generate(new AiChatRequest(
            modelId,
            List.of(
                new AiChatMessage(AiRole.SYSTEM, systemPrompt),
                new AiChatMessage(AiRole.USER, userPrompt)
            )
        ));
        String suggestionId = UUID.randomUUID().toString();
        recordTokenUsage(userId, modelId, suggestionId, response.tokenUsage());
        assistEventPort.aiSuggestionCreated(new AiSuggestionCreatedEvent(
            userId,
            suggestionId,
            INLINE_ASSIST_FEATURE_ID,
            noteId,
            modelId
        ));

        return new InlineAssistResult(
            suggestionId,
            action,
            modelId,
            response.content() == null ? "" : response.content()
        );
    }

    @Override
    public AiSuggestionDecisionResult decideAiSuggestion(AiSuggestionDecisionCommand command) {
        String userId = requireText(command.userId(), "userId");
        String suggestionId = requireText(command.suggestionId(), "suggestionId");
        AiSuggestionDecision decision = command.decision();
        if (decision == null) {
            throw new IllegalArgumentException("decision must not be null.");
        }

        assistEventPort.aiSuggestionDecisionRecorded(new AiSuggestionDecisionRecordedEvent(
            userId,
            suggestionId,
            decision,
            null
        ));
        return new AiSuggestionDecisionResult(suggestionId, decision);
    }

    private String resolveModelId(String userId) {
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseGet(properties::getDefaultModel);
    }

    private void recordTokenUsage(String userId, String modelId, String suggestionId, AiTokenUsage tokenUsage) {
        if (tokenUsage == null || !tokenUsage.hasKnownTokens()) {
            return;
        }
        int inputTokens = tokenCount(tokenUsage.promptTokens());
        int cachedInputTokens = tokenCount(tokenUsage.cachedPromptTokens());
        int billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
        int outputTokens = tokenCount(tokenUsage.completionTokens());
        int reasoningTokens = tokenCount(tokenUsage.reasoningTokens());
        int totalTokens = tokenUsage.totalTokens() == null
            ? inputTokens + outputTokens
            : Math.max(0, tokenUsage.totalTokens());
        TokenCostEstimate cost = usageCostEstimator.estimate(
            modelId,
            inputTokens,
            cachedInputTokens,
            outputTokens
        );

        tokenUsagePort.recordTokenUsage(new TokenUsageRecord(
            UUID.randomUUID().toString(),
            userId,
            SOURCE_SERVICE,
            INLINE_ASSIST_FEATURE_ID,
            modelId,
            inputTokens,
            cachedInputTokens,
            billableInputTokens,
            outputTokens,
            reasoningTokens,
            totalTokens,
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode(),
            suggestionId
        ));
    }

    private static String systemPrompt() {
        return """
            You are BrainX inline writing assistant.
            Use only the selected text and nearby context supplied by the user.
            Return only the final text to insert or replace.
            Do not include explanations, labels, markdown fences, or alternatives.
            """;
    }

    private static String userPrompt(
        InlineAssistAction action,
        String language,
        String selectedText,
        String contextBefore,
        String contextAfter
    ) {
        return """
            Action: %s
            Language: %s

            Before:
            %s

            Selected:
            %s

            After:
            %s
            """.formatted(
            action.name(),
            language,
            blankToMarker(contextBefore),
            blankToMarker(selectedText),
            blankToMarker(contextAfter)
        );
    }

    private static void validateInput(
        InlineAssistAction action,
        String selectedText,
        String contextBefore,
        String contextAfter
    ) {
        switch (action) {
            case REWRITE, TRANSLATE -> {
                if (!StringUtils.hasText(selectedText)) {
                    throw new IllegalArgumentException(action.name() + " requires selectedText.");
                }
            }
            case CONTINUE -> {
                if (!StringUtils.hasText(contextBefore)) {
                    throw new IllegalArgumentException("CONTINUE requires contextBefore.");
                }
            }
            case SUMMARIZE -> {
                if (!StringUtils.hasText(selectedText)
                    && !StringUtils.hasText(contextBefore)
                    && !StringUtils.hasText(contextAfter)) {
                    throw new IllegalArgumentException("SUMMARIZE requires selectedText or context.");
                }
            }
        }
    }

    private static InlineAssistAction requireAction(InlineAssistAction action) {
        if (action == null) {
            throw new IllegalArgumentException("action must not be null.");
        }
        return action;
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static String normalize(String value) {
        return value == null ? "" : value;
    }

    private static String blankToMarker(String value) {
        return StringUtils.hasText(value) ? value : "(empty)";
    }

    private static int tokenCount(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (int) Math.ceil(safeText.length() / 4.0d));
    }
}
