package com.brainx.intelligence.assist.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistCommand;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase.AiSuggestionDecisionCommand;
import com.brainx.intelligence.assist.application.port.outbound.AssistEventPort;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.brainx.intelligence.llmops.LlmOpsTestSupport;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

import reactor.core.publisher.Flux;

class AssistServiceTest {

    private static final String LONG_SELECTED_TEXT = "선택된 문장을 충분히 길게 작성해서 인라인 AI가 실제로 다시쓰기 작업을 수행할 수 있는 입력입니다.";
    private static final String LONG_CONTEXT_BEFORE =
        "앞 문맥은 이어쓰기가 자연스럽게 동작할 수 있도록 최소 기준보다 길게 준비한다. "
            + "사용자가 이미 작성한 노트의 흐름과 핵심 용어, 다음 문장으로 이어질 단서를 포함한다.";
    private static final String LONG_CONTEXT_AFTER =
        "뒤 문맥도 요약 테스트에서 사용할 수 있도록 충분한 길이를 둔다. "
            + "이 내용은 선택 영역 주변에 있는 참고 문맥이며 모델이 작업 범위를 오해하지 않도록 한다.";

    private final AssistProperties properties = new AssistProperties();
    private final FakeAiModelSettingsPort settingsPort = new FakeAiModelSettingsPort();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeAiModelCatalogPort catalogPort = new FakeAiModelCatalogPort();
    private final FakeAssistEventPort assistEventPort = new FakeAssistEventPort();
    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler stylePromptCompiler = new StylePromptCompiler(styleProfilePort);
    private final LlmOpsStore llmOpsStore = LlmOpsTestSupport.store();
    private final AssistService service = new AssistService(
        properties,
        settingsPort,
        entitlementPort,
        chatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(catalogPort)),
        LlmOpsTestSupport.runRecorder(llmOpsStore),
        LlmOpsTestSupport.promptRegistry(llmOpsStore),
        assistEventPort,
        stylePromptCompiler
    );

    @BeforeEach
    void setUp() {
        properties.setDefaultModel("fallback-model");
        chatPort.response = new AiChatResponse("generated text", new AiTokenUsage(100, 20, 120, 10, 3));
        styleProfilePort.profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("directness", "high")),
            new WritingStyle(Map.of("formality", "business", "sentenceLength", "short")),
            null
        );
        catalogPort.model = new AiModel(
            "user-model",
            "User model",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.010000"),
                new BigDecimal("0.002000"),
                new BigDecimal("0.030000"),
                "usd"
            )
        );
    }

    @Test
    void rewriteUsesUserDefaultModelAndRecordsUsageAndCreatedEvent() {
        settingsPort.settings = new AiModelSettings("user-1", "user-model", Map.of());

        var result = service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            LONG_SELECTED_TEXT,
            "before",
            "after",
            InlineAssistAction.REWRITE,
            "en"
        ));

        assertThat(result.text()).isEqualTo("generated text");
        assertThat(result.modelId()).isEqualTo("user-model");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("INLINE_ASSIST");
        assertThat(entitlementPort.lastRequest.requestedTokenEstimate()).isPositive();
        assertThat(chatPort.calls).isEqualTo(1);
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("user-model");
        assertThat(chatPort.lastRequest.messages().get(0).role()).isEqualTo(AiRole.SYSTEM);
        assertThat(chatPort.lastRequest.messages().get(0).content())
            .contains("Before and After are immutable reference context only")
            .contains("return only a replacement for Selected")
            .contains("Never include, paraphrase, move, summarize, or rewrite Before/After")
            .contains("Mandatory user style instructions")
            .contains("every final generated or edited user-facing text segment")
            .contains("Use this formality/tone: business")
            .doesNotContain("every final user-facing conversational sentence");
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: REWRITE")
            .contains("Language: en")
            .contains("Context Before (reference only; do not rewrite or include in REWRITE/TRANSLATE output):\nbefore")
            .contains("Selected (only this section may be replaced for REWRITE/TRANSLATE):\n" + LONG_SELECTED_TEXT)
            .contains("Context After (reference only; do not rewrite or include in REWRITE/TRANSLATE output):\nafter")
            .contains("If Action is REWRITE, return only the replacement for Selected");

        assertThat(tokenUsagePort.records).hasSize(1);
        var usage = tokenUsagePort.records.getFirst();
        assertThat(usage.featureId()).isEqualTo("inline-assist-chat");
        assertThat(usage.modelId()).isEqualTo("user-model");
        assertThat(usage.inputTokens()).isEqualTo(100);
        assertThat(usage.cachedInputTokens()).isEqualTo(10);
        assertThat(usage.billableInputTokens()).isEqualTo(90);
        assertThat(usage.outputTokens()).isEqualTo(20);
        assertThat(usage.reasoningTokens()).isEqualTo(3);
        assertThat(usage.totalTokens()).isEqualTo(120);
        assertThat(usage.estimatedCost()).isNotNull();
        assertThat(usage.costCurrency()).isEqualTo("USD");
        assertThat(usage.causationId()).isEqualTo(result.suggestionId());

        assertThat(assistEventPort.createdEvents).hasSize(1);
        var event = assistEventPort.createdEvents.getFirst();
        assertThat(event.userId()).isEqualTo("user-1");
        assertThat(event.suggestionId()).isEqualTo(result.suggestionId());
        assertThat(event.featureId()).isEqualTo("inline-assist-chat");
        assertThat(event.noteId()).isEqualTo("note-1");
        assertThat(event.modelId()).isEqualTo("user-model");
    }

    @Test
    void usesAssistDefaultModelWhenUserDefaultModelIsMissing() {
        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.SUMMARIZE,
            null
        ));

        assertThat(chatPort.lastRequest.modelId()).isEqualTo("fallback-model");
    }

    @ParameterizedTest
    @EnumSource(value = InlineAssistAction.class, names = {"REWRITE", "TRANSLATE"})
    void selectedTextActionsRequireSelectedText(InlineAssistAction action) {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            " ",
            "before",
            "after",
            action,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("선택 영역이 너무 짧습니다");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void selectedTextActionsRequireEnoughSelectedText() {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            "짧음",
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.REWRITE,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("선택 영역이 너무 짧습니다");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void continueRequiresContextBefore() {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            " ",
            "after",
            InlineAssistAction.CONTINUE,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("이어쓰기에 필요한 앞 문맥이 부족합니다");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void continueRequiresEnoughContextBefore() {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            "한 문장뿐인 앞 문맥",
            "after",
            InlineAssistAction.CONTINUE,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("이어쓰기에 필요한 앞 문맥이 부족합니다");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void summarizeCanUseContextWithoutSelectedText() {
        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.SUMMARIZE,
            null
        ));

        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: SUMMARIZE")
            .contains("Language: ko")
            .contains("Context Before (reference only; do not rewrite or include in REWRITE/TRANSLATE output):\n" + LONG_CONTEXT_BEFORE)
            .contains("Selected (only this section may be replaced for REWRITE/TRANSLATE):\n(empty)")
            .contains("Context After (reference only; do not rewrite or include in REWRITE/TRANSLATE output):\n" + LONG_CONTEXT_AFTER)
            .contains("If Action is SUMMARIZE, return only the summary");
    }

    @Test
    void summarizeRequiresEnoughCombinedContext() {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            "짧음",
            "앞도 짧음",
            "뒤도 짧음",
            InlineAssistAction.SUMMARIZE,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("요약에 필요한 노트 내용이 너무 짧습니다");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void draftUsesPromptDefaultTargetLengthAndRecordsUsageAndCreatedEvent() {
        var result = service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.DRAFT,
            "ko",
            "RAG 개념을 처음 접하는 독자를 위해 설명 문단을 작성해줘",
            null
        ));

        assertThat(result.action()).isEqualTo(InlineAssistAction.DRAFT);
        assertThat(result.text()).isEqualTo("generated text");
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: DRAFT")
            .contains("Draft Prompt:\nRAG 개념을 처음 접하는 독자를 위해 설명 문단을 작성해줘")
            .contains("Target Length: about 600 characters")
            .contains("If Action is DRAFT, write only a new draft near Target Length")
            .contains("do not repeat them");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("INLINE_ASSIST");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("inline-assist-chat");
        assertThat(tokenUsagePort.records.getFirst().causationId()).isEqualTo(result.suggestionId());
        assertThat(assistEventPort.createdEvents).hasSize(1);
        assertThat(assistEventPort.createdEvents.getFirst().noteId()).isEqualTo("note-1");
    }

    @Test
    void draftTreatsSelectedTextAsTopicCandidateWhenPresent() {
        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            "지식 그래프 자동 연결",
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.DRAFT,
            "ko",
            "선택 텍스트를 새 노트 제목으로 삼아 개요 문서를 작성해줘",
            900
        ));

        assertThat(chatPort.lastRequest.messages().get(0).content())
            .contains("For DRAFT, if Selected is not empty");
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: DRAFT")
            .contains("Selected (only this section may be replaced for REWRITE/TRANSLATE):\n지식 그래프 자동 연결")
            .contains("If Action is DRAFT and Selected is not empty, use Selected as the topic/title candidate")
            .contains("Target Length: about 900 characters");
    }

    @Test
    void draftTargetLengthIsClampedToAllowedRange() {
        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            null,
            null,
            InlineAssistAction.DRAFT,
            null,
            "짧은 초안 작성",
            50
        ));

        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Target Length: about 100 characters");

        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            null,
            null,
            InlineAssistAction.DRAFT,
            null,
            "긴 초안 작성",
            5000
        ));

        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Target Length: about 3000 characters");
    }

    @Test
    void draftRequiresPrompt() {
        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            LONG_CONTEXT_BEFORE,
            LONG_CONTEXT_AFTER,
            InlineAssistAction.DRAFT,
            null,
            " ",
            600
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("작성할 주제나 요구사항을 입력해 주세요");

        assertThat(chatPort.calls).isZero();
        assertThat(assistEventPort.createdEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void entitlementDeniedStopsBeforeAiUsageAndEvents() {
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            LONG_SELECTED_TEXT,
            null,
            null,
            InlineAssistAction.REWRITE,
            null
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(chatPort.calls).isZero();
        assertThat(tokenUsagePort.records).isEmpty();
        assertThat(assistEventPort.createdEvents).isEmpty();
    }

    @Test
    void decisionRecordsDecisionEventOnly() {
        var result = service.decideAiSuggestion(new AiSuggestionDecisionCommand(
            "user-1",
            "suggestion-1",
            AiSuggestionDecision.ACCEPTED
        ));

        assertThat(result.suggestionId()).isEqualTo("suggestion-1");
        assertThat(result.decision()).isEqualTo(AiSuggestionDecision.ACCEPTED);
        assertThat(assistEventPort.decisionEvents).hasSize(1);
        assertThat(assistEventPort.decisionEvents.getFirst().userId()).isEqualTo("user-1");
        assertThat(assistEventPort.decisionEvents.getFirst().suggestionId()).isEqualTo("suggestion-1");
        assertThat(assistEventPort.decisionEvents.getFirst().decision()).isEqualTo(AiSuggestionDecision.ACCEPTED);
        assertThat(assistEventPort.decisionEvents.getFirst().appliedNoteId()).isNull();
    }

    private static final class FakeAiModelSettingsPort implements AiModelSettingsPort {

        private AiModelSettings settings;

        @Override
        public AiModelSettings save(AiModelSettings settings) {
            this.settings = settings;
            return settings;
        }

        @Override
        public Optional<AiModelSettings> findSettingsByUserId(String userId) {
            return Optional.ofNullable(settings)
                .filter(item -> item.userId().equals(userId));
        }
    }

    private static final class FakeEntitlementPort implements EntitlementPort {

        private boolean allowed = true;
        private String reasonCode;
        private EntitlementRequest lastRequest;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            lastRequest = request;
            return new EntitlementDecision(allowed, reasonCode, allowed ? 1000 : 0);
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private int calls;
        private AiChatRequest lastRequest;
        private AiChatResponse response = new AiChatResponse("", null);

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            calls++;
            lastRequest = request;
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalogPort implements AiModelCatalogPort {

        private AiModel model;

        @Override
        public List<AiModel> findAll() {
            return model == null ? List.of() : List.of(model);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return model != null && model.modelId().equals(modelId)
                ? Optional.of(model)
                : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return model != null && model.modelId().equals(modelId);
        }
    }

    private static final class FakeStyleProfilePort implements StyleProfilePort {

        private StyleProfile profile;

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            profile = styleProfile;
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return Optional.ofNullable(profile)
                .filter(item -> item.userId().equals(userId));
        }
    }

    private static final class FakeAssistEventPort implements AssistEventPort {

        private final List<AiSuggestionCreatedEvent> createdEvents = new ArrayList<>();
        private final List<AiSuggestionDecisionRecordedEvent> decisionEvents = new ArrayList<>();

        @Override
        public void aiSuggestionCreated(AiSuggestionCreatedEvent event) {
            createdEvents.add(event);
        }

        @Override
        public void aiSuggestionDecisionRecorded(AiSuggestionDecisionRecordedEvent event) {
            decisionEvents.add(event);
        }
    }
}
