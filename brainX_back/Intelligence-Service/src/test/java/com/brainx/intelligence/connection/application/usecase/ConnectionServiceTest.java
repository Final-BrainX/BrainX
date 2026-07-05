package com.brainx.intelligence.connection.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkComparison;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCostEstimate;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkStrategyResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSuggestion;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkUsageSummary;
import com.brainx.intelligence.autolink.domain.MarkdownAnchorLocator.AnchorRange;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.BridgeConceptCreatedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.LinkSuggestionCreatedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort.ConnectionBridgeSourceNote;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort.ConnectionNoteSource;
import com.brainx.intelligence.connection.domain.ConnectionConflictException;
import com.brainx.intelligence.connection.domain.ConnectionForbiddenException;
import com.brainx.intelligence.connection.domain.ConnectionNotFoundException;
import com.brainx.intelligence.connection.domain.ConnectionProviderUnavailableException;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class ConnectionServiceTest {

    private final FakeNoteSourcePort noteSourcePort = new FakeNoteSourcePort();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAutoLinkUseCase autoLinkUseCase = new FakeAutoLinkUseCase();
    private final FakeConnectionEventPort connectionEventPort = new FakeConnectionEventPort();
    private final ConnectionBridgeProperties bridgeProperties = new ConnectionBridgeProperties();
    private final FakeAiModelSettingsPort aiModelSettingsPort = new FakeAiModelSettingsPort();
    private final FakeAiChatPort aiChatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final AiTokenUsageCostEstimator usageCostEstimator = new AiTokenUsageCostEstimator(new FakeAiModelCatalogPort());
    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler stylePromptCompiler = new StylePromptCompiler(styleProfilePort);
    private final ConnectionService service = new ConnectionService(
        noteSourcePort,
        entitlementPort,
        autoLinkUseCase,
        connectionEventPort,
        bridgeProperties,
        aiModelSettingsPort,
        aiChatPort,
        new AiUsageRecorder(tokenUsagePort, usageCostEstimator),
        stylePromptCompiler,
        new ObjectMapper()
    );

    @Test
    void createLinkSuggestionsUsesDefaultDocumentGroupAndFiltersBySourceNote() {
        noteSourcePort.source = Optional.of(new ConnectionNoteSource(
            "user-1",
            "default",
            "note-1",
            "Source"
        ));
        autoLinkUseCase.result = completedResult(List.of(
            suggestion("suggestion-1", "note-1", "target-1", 0.84d),
            suggestion("suggestion-2", "other-note", "target-2", 0.95d)
        ));

        var result = service.createLinkSuggestions(new LinkSuggestionsCommand("user-1", "note-1"));

        assertThat(noteSourcePort.lastDocumentGroupId).isEqualTo("default");
        assertThat(autoLinkUseCase.lastCommand.documentGroupId()).isEqualTo("default");
        assertThat(autoLinkUseCase.lastCommand.strategy()).isEqualTo(NoteAutoLinkStrategy.VECTOR_LLM);
        assertThat(autoLinkUseCase.lastCommand.maxNotes()).isNull();
        assertThat(autoLinkUseCase.lastCommand.modelId()).isNull();
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("LINK_SUGGESTIONS");
        assertThat(result.suggestions()).hasSize(1);
        assertThat(result.suggestions().getFirst().suggestionId()).isEqualTo("suggestion-1");
        assertThat(result.suggestions().getFirst().targetNoteId()).isEqualTo("target-1");
        assertThat(result.suggestions().getFirst().score()).isEqualTo(0.84d);
        assertThat(connectionEventPort.createdEvents).hasSize(1);
        assertThat(connectionEventPort.createdEvents.getFirst().featureId()).isEqualTo("link-suggestions");
        assertThat(connectionEventPort.createdEvents.getFirst().noteId()).isEqualTo("note-1");
        assertThat(connectionEventPort.createdEvents.getFirst().modelId()).isEqualTo("gpt-test");
    }

    @Test
    void createBridgeConceptsUsesDefaultGroupTitlesTagsAndPublishesUsageEvents() {
        aiModelSettingsPort.settings = Optional.of(new AiModelSettings("user-1", "gpt-user", Map.of()));
        styleProfilePort.profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("warmth", "warm", "directness", "high")),
            new WritingStyle(Map.of("formality", "business")),
            null
        );
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of("backend")),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of("sql", "storage"))
        );
        aiChatPort.response = new AiChatResponse(
            """
                [
                  {"title":"JDBC 연결 가이드","bridgeReason":"Java 애플리케이션과 데이터베이스 접근을 이어준다."},
                  {"title":"트랜잭션 설계 노트","bridgeReason":"백엔드 코드와 저장소 일관성 개념을 연결한다."}
                ]
                """,
            new AiTokenUsage(30, 10, 40, 5, 2)
        );

        var result = service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of(" note-1 ", "note-2", "note-1")
        ));

        assertThat(noteSourcePort.lastBridgeDocumentGroupId).isEqualTo("default");
        assertThat(noteSourcePort.lastBridgeNoteIds).containsExactly("note-1", "note-2");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("LINK_SUGGESTIONS");
        assertThat(entitlementPort.lastRequest.requestedTokenEstimate()).isPositive();
        assertThat(aiChatPort.lastRequest.modelId()).isEqualTo("gpt-user");
        String systemPrompt = aiChatPort.lastRequest.messages().getFirst().content();
        assertThat(systemPrompt)
            .contains("including both required wiki links exactly as [[title]]")
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Keep the directness level: high")
            .doesNotContain("every final generated or edited user-facing text segment");
        String prompt = aiChatPort.lastRequest.messages().get(1).content();
        assertThat(prompt).contains("Java", "backend", "Database", "sql", "[[Java]]", "[[Database]]");
        assertThat(prompt).doesNotContain("markdown body");
        assertThat(result.recommendations()).hasSize(2);
        assertThat(result.recommendations().getFirst().noteId()).startsWith("bridge-");
        assertThat(result.recommendations().getFirst().title()).isEqualTo("JDBC 연결 가이드");
        assertThat(result.recommendations().getFirst().bridgeReason()).contains("[[Java]]", "[[Database]]");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("bridge-concepts");
        assertThat(tokenUsagePort.records.getFirst().inputTokens()).isEqualTo(30);
        assertThat(tokenUsagePort.records.getFirst().cachedInputTokens()).isEqualTo(5);
        assertThat(tokenUsagePort.records.getFirst().outputTokens()).isEqualTo(10);
        assertThat(tokenUsagePort.records.getFirst().reasoningTokens()).isEqualTo(2);
        assertThat(connectionEventPort.bridgeEvents).hasSize(2);
        assertThat(connectionEventPort.bridgeEvents.getFirst().featureId()).isEqualTo("bridge-concepts");
        assertThat(connectionEventPort.bridgeEvents.getFirst().noteId()).isNull();
        assertThat(connectionEventPort.bridgeEvents.getFirst().modelId()).isEqualTo("gpt-user");

        var repeated = service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", "note-2")
        ));

        assertThat(repeated.recommendations().getFirst().noteId())
            .isEqualTo(result.recommendations().getFirst().noteId());
    }

    @Test
    void bridgeReasonLinksOnlyFirstTwoSourceNotes() {
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-3", "Kafka", List.of())
        );
        aiChatPort.response = new AiChatResponse(
            """
                [{"title":"데이터 흐름 설계","bridgeReason":"[[Java]] 애플리케이션과 저장소 사이의 흐름을 설명한다."}]
                """,
            null
        );

        var result = service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", "note-2", "note-3")
        ));

        assertThat(result.recommendations()).hasSize(1);
        assertThat(result.recommendations().getFirst().bridgeReason())
            .contains("[[Java]]", "[[Database]]")
            .doesNotContain("[[Kafka]]");
        assertThat(aiChatPort.lastRequest.messages().get(1).content())
            .contains("[[Java]]", "[[Database]]")
            .doesNotContain("[[Kafka]]");
    }

    @Test
    void createBridgeConceptsRejectsTooFewUniqueNoteIds() {
        assertThatThrownBy(() -> service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", " note-1 ")
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("at least 2");
    }

    @Test
    void createBridgeConceptsRejectsTooManyNoteIds() {
        assertThatThrownBy(() -> service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11")
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("at most 10");
    }

    @Test
    void missingBridgeSourceNoteThrowsNotFoundBeforeEntitlement() {
        noteSourcePort.bridgeSources = List.of(new ConnectionBridgeSourceNote(
            "user-1",
            "default",
            "note-1",
            "Java",
            List.of()
        ));

        assertThatThrownBy(() -> service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", "missing")
        )))
            .isInstanceOf(ConnectionNotFoundException.class)
            .hasMessageContaining("missing");

        assertThat(entitlementPort.lastRequest).isNull();
        assertThat(aiChatPort.generateCalls).isZero();
    }

    @Test
    void bridgeEntitlementDeniedStopsBeforeModelCall() {
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of())
        );
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", "note-2")
        )))
            .isInstanceOf(ConnectionForbiddenException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(aiChatPort.generateCalls).isZero();
    }

    @Test
    void bridgeDoesNotRecordLedgerUsageWhenProviderUsageIsMissing() {
        bridgeProperties.setDefaultModel("gpt-fallback");
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of())
        );
        aiChatPort.response = new AiChatResponse(
            """
                [{"title":"JDBC 입문","bridgeReason":"Java와 Database 사이의 접근 계층을 설명한다."}]
                """,
            null
        );

        var result = service.createBridgeConcepts(new BridgeConceptsCommand("user-1", List.of("note-1", "note-2")));

        assertThat(aiChatPort.lastRequest.modelId()).isEqualTo("gpt-fallback");
        assertThat(result.recommendations()).hasSize(1);
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void invalidBridgeResponseReturnsEmptyRecommendations() {
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of())
        );
        aiChatPort.response = new AiChatResponse("not-json", null);

        var result = service.createBridgeConcepts(new BridgeConceptsCommand("user-1", List.of("note-1", "note-2")));

        assertThat(result.recommendations()).isEmpty();
        assertThat(connectionEventPort.bridgeEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void bridgeProviderFailureBecomesProviderUnavailable() {
        noteSourcePort.bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Java", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Database", List.of())
        );
        aiChatPort.failure = new IllegalStateException("ChatClient.Builder bean is not configured.");

        assertThatThrownBy(() -> service.createBridgeConcepts(new BridgeConceptsCommand(
            "user-1",
            List.of("note-1", "note-2")
        )))
            .isInstanceOf(ConnectionProviderUnavailableException.class);
    }

    @Test
    void missingSourceNoteThrowsNotFoundBeforeEntitlement() {
        noteSourcePort.source = Optional.empty();

        assertThatThrownBy(() -> service.createLinkSuggestions(new LinkSuggestionsCommand("user-1", "note-1")))
            .isInstanceOf(ConnectionNotFoundException.class);

        assertThat(entitlementPort.lastRequest).isNull();
        assertThat(autoLinkUseCase.lastCommand).isNull();
    }

    @Test
    void entitlementDeniedStopsBeforeAutoLink() {
        noteSourcePort.source = Optional.of(new ConnectionNoteSource("user-1", "default", "note-1", "Source"));
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.createLinkSuggestions(new LinkSuggestionsCommand("user-1", "note-1")))
            .isInstanceOf(ConnectionForbiddenException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(autoLinkUseCase.lastCommand).isNull();
    }

    @Test
    void limitExceededBecomesConflict() {
        noteSourcePort.source = Optional.of(new ConnectionNoteSource("user-1", "default", "note-1", "Source"));
        autoLinkUseCase.result = new AutoLinkResult(
            "user-1",
            "default",
            NoteAutoLinkStrategy.VECTOR_LLM,
            "LIMIT_EXCEEDED",
            true,
            50,
            51,
            0,
            List.of(),
            new AutoLinkComparison(0, 0, 0)
        );

        assertThatThrownBy(() -> service.createLinkSuggestions(new LinkSuggestionsCommand("user-1", "note-1")))
            .isInstanceOf(ConnectionConflictException.class);
    }

    @Test
    void aiUnavailableBecomesProviderUnavailable() {
        noteSourcePort.source = Optional.of(new ConnectionNoteSource("user-1", "default", "note-1", "Source"));
        autoLinkUseCase.result = resultWithStrategy("AI_UNAVAILABLE", List.of());

        assertThatThrownBy(() -> service.createLinkSuggestions(new LinkSuggestionsCommand("user-1", "note-1")))
            .isInstanceOf(ConnectionProviderUnavailableException.class);
    }

    private static AutoLinkResult completedResult(List<AutoLinkSuggestion> suggestions) {
        return resultWithStrategy("COMPLETED", suggestions);
    }

    private static AutoLinkResult resultWithStrategy(String status, List<AutoLinkSuggestion> suggestions) {
        return new AutoLinkResult(
            "user-1",
            "default",
            NoteAutoLinkStrategy.VECTOR_LLM,
            "COMPLETED",
            false,
            50,
            2,
            2,
            List.of(new AutoLinkStrategyResult(
                NoteAutoLinkStrategy.VECTOR_LLM,
                status,
                "gpt-test",
                2,
                1,
                1,
                suggestions.size(),
                suggestions.size(),
                0,
                0,
                0,
                0,
                1L,
                suggestions,
                List.of(),
                new AutoLinkUsageSummary(0, 0, 0, 0, 0, 0, new AutoLinkCostEstimate(
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    "USD"
                ))
            )),
            new AutoLinkComparison(0, 0, 0)
        );
    }

    private static AutoLinkSuggestion suggestion(
        String suggestionId,
        String sourceNoteId,
        String targetNoteId,
        double confidence
    ) {
        return new AutoLinkSuggestion(
            suggestionId,
            sourceNoteId,
            "Source",
            targetNoteId,
            "Target " + targetNoteId,
            new AnchorRange(0, 6, 1, 1, 1, 7, "Anchor"),
            confidence,
            0.91d,
            "related note",
            "evidence"
        );
    }

    private static final class FakeNoteSourcePort implements ConnectionNoteSourcePort {

        private Optional<ConnectionNoteSource> source = Optional.of(new ConnectionNoteSource(
            "user-1",
            "default",
            "note-1",
            "Source"
        ));
        private List<ConnectionBridgeSourceNote> bridgeSources = List.of(
            new ConnectionBridgeSourceNote("user-1", "default", "note-1", "Source 1", List.of()),
            new ConnectionBridgeSourceNote("user-1", "default", "note-2", "Source 2", List.of())
        );
        private String lastDocumentGroupId;
        private String lastBridgeDocumentGroupId;
        private List<String> lastBridgeNoteIds = List.of();

        @Override
        public Optional<ConnectionNoteSource> findLinkSuggestionSourceNote(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            lastDocumentGroupId = documentGroupId;
            return source;
        }

        @Override
        public List<ConnectionBridgeSourceNote> findBridgeSourceNotes(
            String userId,
            String documentGroupId,
            List<String> noteIds
        ) {
            lastBridgeDocumentGroupId = documentGroupId;
            lastBridgeNoteIds = List.copyOf(noteIds);
            return bridgeSources.stream()
                .filter(source -> noteIds.contains(source.noteId()))
                .toList();
        }
    }

    private static final class FakeEntitlementPort implements EntitlementPort {

        private boolean allowed = true;
        private String reasonCode;
        private EntitlementRequest lastRequest;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            lastRequest = request;
            return new EntitlementDecision(allowed, reasonCode, allowed ? 100 : 0);
        }
    }

    private static final class FakeAutoLinkUseCase implements NoteAutoLinkUseCase {

        private AutoLinkCommand lastCommand;
        private AutoLinkResult result = completedResult(List.of());

        @Override
        public AutoLinkResult analyze(AutoLinkCommand command) {
            lastCommand = command;
            return result;
        }
    }

    private static final class FakeConnectionEventPort implements ConnectionEventPort {

        private final List<LinkSuggestionCreatedEvent> createdEvents = new ArrayList<>();
        private final List<BridgeConceptCreatedEvent> bridgeEvents = new ArrayList<>();

        @Override
        public void linkSuggestionCreated(LinkSuggestionCreatedEvent event) {
            createdEvents.add(event);
        }

        @Override
        public void bridgeConceptCreated(BridgeConceptCreatedEvent event) {
            bridgeEvents.add(event);
        }
    }

    private static final class FakeAiModelSettingsPort implements AiModelSettingsPort {

        private Optional<AiModelSettings> settings = Optional.empty();

        @Override
        public AiModelSettings save(AiModelSettings settings) {
            this.settings = Optional.of(settings);
            return settings;
        }

        @Override
        public Optional<AiModelSettings> findSettingsByUserId(String userId) {
            return settings;
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private AiChatResponse response = new AiChatResponse("[]", null);
        private RuntimeException failure;
        private AiChatRequest lastRequest;
        private int generateCalls;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            generateCalls++;
            lastRequest = request;
            if (failure != null) {
                throw failure;
            }
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

        @Override
        public List<AiModel> findAll() {
            return List.of();
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return false;
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
}
