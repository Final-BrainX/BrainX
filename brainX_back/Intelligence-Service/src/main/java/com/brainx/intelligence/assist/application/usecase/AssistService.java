package com.brainx.intelligence.assist.application.usecase;

import java.util.List;
import java.util.Locale;
import java.util.Map;
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
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

@Service
public class AssistService implements CreateInlineAssistUseCase, DecideAiSuggestionUseCase {

    static final String INLINE_ASSIST_CAPABILITY = "INLINE_ASSIST";
    static final String INLINE_ASSIST_FEATURE_ID = "inline-assist-chat";
    private static final String DEFAULT_LANGUAGE = "ko";
    private static final int MIN_SUMMARIZE_CONTEXT_CHARS = 80;
    private static final int MIN_CONTINUE_BEFORE_CHARS = 120;
    private static final int MIN_REWRITE_SELECTED_CHARS = 10;
    private static final int DEFAULT_DRAFT_TARGET_LENGTH = 600;
    private static final int MIN_DRAFT_TARGET_LENGTH = 100;
    private static final int MAX_DRAFT_TARGET_LENGTH = 3000;

    private final AssistProperties properties;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final EntitlementPort entitlementPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final AssistEventPort assistEventPort;
    private final StylePromptCompiler stylePromptCompiler;

    public AssistService(
        AssistProperties properties,
        AiModelSettingsPort aiModelSettingsPort,
        EntitlementPort entitlementPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        AssistEventPort assistEventPort,
        StylePromptCompiler stylePromptCompiler
    ) {
        this.properties = properties;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.entitlementPort = entitlementPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.assistEventPort = assistEventPort;
        this.stylePromptCompiler = stylePromptCompiler;
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
        String draftPrompt = normalize(command.draftPrompt());
        int targetLength = normalizeTargetLength(command.targetLength());
        validateInput(action, selectedText, contextBefore, contextAfter, draftPrompt);

        String modelId = resolveModelId(userId);
        PromptResolution promptResolution = promptRegistryService.resolve("inline-assist", systemPrompt());
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            promptResolution.content(),
            stylePromptCompiler.writingStyleInstructions(userId)
        );
        String userPrompt = userPrompt(action, language, selectedText, contextBefore, contextAfter, draftPrompt, targetLength);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            INLINE_ASSIST_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new IllegalArgumentException("AI capability is not available: " + entitlement.reasonCode());
        }

        String suggestionId = UUID.randomUUID().toString();
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, systemPrompt),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        var recorded = aiRunRecorder.recordChatGenerateWithRun(
            userId,
            INLINE_ASSIST_FEATURE_ID,
            promptResolution.promptKey(),
            promptResolution.version(),
            modelId,
            "AI_SUGGESTION",
            suggestionId,
            messages,
            Map.of("noteId", noteId, "action", action.name()),
            () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
        );
        var response = recorded.response();
        aiUsageRecorder.recordChatUsage(userId, INLINE_ASSIST_FEATURE_ID, modelId, suggestionId, response.tokenUsage());
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
            recorded.llmRunId(),
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

    private static String systemPrompt() {
        return """
            You are BrainX inline writing assistant.
            Follow the action-specific output scope in the user message.
            For REWRITE and TRANSLATE, Before and After are immutable reference context only; return only a replacement for Selected.
            For DRAFT, Before and After are style and flow reference only; write a new draft that satisfies the user's draft prompt.
            Never include, paraphrase, move, summarize, or rewrite Before/After in a REWRITE or TRANSLATE output.
            Return only the final text to insert or replace.
            Preserve meaningful Markdown syntax from Selected, including headings, lists, links, emphasis, inline code, and code blocks.
            For DRAFT, if Selected is not empty, treat it as the user's selected topic or title candidate rather than text to replace.
            Do not include explanations, labels, alternatives, or wrapping markdown fences unless the selected content itself is a code block.
            """;
    }

    private static String userPrompt(
        InlineAssistAction action,
        String language,
        String selectedText,
        String contextBefore,
        String contextAfter,
        String draftPrompt,
        int targetLength
    ) {
        return """
            Action: %s
            Language: %s
            Draft Prompt:
            %s
            Target Length: about %d characters

            Context Before (reference only; do not rewrite or include in REWRITE/TRANSLATE output):
            %s

            Selected (only this section may be replaced for REWRITE/TRANSLATE):
            %s

            Context After (reference only; do not rewrite or include in REWRITE/TRANSLATE output):
            %s

            Output scope:
            - If Action is REWRITE, return only the replacement for Selected.
            - If Action is TRANSLATE, return only the translation of Selected.
            - If Action is CONTINUE, return only the newly continued text.
            - If Action is SUMMARIZE, return only the summary.
            - If Action is DRAFT and Selected is not empty, use Selected as the topic/title candidate and use Before/After to understand its context.
            - If Action is DRAFT, write only a new draft near Target Length that satisfies Draft Prompt. Use Before/After only to match tone and flow, and do not repeat them.
            """.formatted(
            action.name(),
            language,
            blankToMarker(draftPrompt),
            targetLength,
            blankToMarker(contextBefore),
            blankToMarker(selectedText),
            blankToMarker(contextAfter)
        );
    }

    private static void validateInput(
        InlineAssistAction action,
        String selectedText,
        String contextBefore,
        String contextAfter,
        String draftPrompt
    ) {
        switch (action) {
            case REWRITE, TRANSLATE -> {
                if (charCount(selectedText) < MIN_REWRITE_SELECTED_CHARS) {
                    throw new IllegalArgumentException("선택 영역이 너무 짧습니다. 최소 한 문장 이상 선택한 뒤 다시 시도해 주세요.");
                }
            }
            case CONTINUE -> {
                if (charCount(contextBefore) < MIN_CONTINUE_BEFORE_CHARS) {
                    throw new IllegalArgumentException("이어쓰기에 필요한 앞 문맥이 부족합니다. 최소 한두 문단 이상 작성한 뒤 다시 시도해 주세요.");
                }
            }
            case SUMMARIZE -> {
                if (charCount(selectedText) + charCount(contextBefore) + charCount(contextAfter)
                    < MIN_SUMMARIZE_CONTEXT_CHARS) {
                    throw new IllegalArgumentException("요약에 필요한 노트 내용이 너무 짧습니다. 더 긴 본문이나 선택 영역을 제공해 주세요.");
                }
            }
            case DRAFT -> {
                if (!StringUtils.hasText(draftPrompt)) {
                    throw new IllegalArgumentException("작성할 주제나 요구사항을 입력해 주세요.");
                }
            }
        }
    }

    private static int normalizeTargetLength(Integer targetLength) {
        if (targetLength == null) {
            return DEFAULT_DRAFT_TARGET_LENGTH;
        }
        return Math.max(MIN_DRAFT_TARGET_LENGTH, Math.min(MAX_DRAFT_TARGET_LENGTH, targetLength));
    }

    private static int charCount(String value) {
        return value == null ? 0 : value.trim().length();
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

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (int) Math.ceil(safeText.length() / 4.0d));
    }
}
