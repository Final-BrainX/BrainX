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
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

import reactor.core.publisher.Flux;

class AssistServiceTest {

    private final AssistProperties properties = new AssistProperties();
    private final FakeAiModelSettingsPort settingsPort = new FakeAiModelSettingsPort();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeAiModelCatalogPort catalogPort = new FakeAiModelCatalogPort();
    private final FakeAssistEventPort assistEventPort = new FakeAssistEventPort();
    private final AssistService service = new AssistService(
        properties,
        settingsPort,
        entitlementPort,
        chatPort,
        tokenUsagePort,
        new AiTokenUsageCostEstimator(catalogPort),
        assistEventPort
    );

    @BeforeEach
    void setUp() {
        properties.setDefaultModel("fallback-model");
        chatPort.response = new AiChatResponse("generated text", new AiTokenUsage(100, 20, 120, 10, 3));
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
            " selected ",
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
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: REWRITE")
            .contains("Language: en")
            .contains("Before:\nbefore")
            .contains("Selected:\n selected ")
            .contains("After:\nafter");

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
            "selected",
            "",
            "",
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
            .hasMessageContaining("requires selectedText");

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
            .hasMessageContaining("CONTINUE requires contextBefore");
    }

    @Test
    void summarizeCanUseContextWithoutSelectedText() {
        service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            null,
            "context before",
            "context after",
            InlineAssistAction.SUMMARIZE,
            null
        ));

        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("Action: SUMMARIZE")
            .contains("Language: ko")
            .contains("Before:\ncontext before")
            .contains("Selected:\n(empty)")
            .contains("After:\ncontext after");
    }

    @Test
    void entitlementDeniedStopsBeforeAiUsageAndEvents() {
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.createInlineAssist(new InlineAssistCommand(
            "user-1",
            "note-1",
            "selected",
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
