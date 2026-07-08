package com.brainx.intelligence.chat.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCommand;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

import reactor.core.publisher.Flux;

class McpRagAnswerServiceTest {

    private final FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeSettingsPort settingsPort = new FakeSettingsPort();
    private final FakeAiChatPort aiChatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final McpRagAnswerService service = new McpRagAnswerService(
        chunkRetrieval,
        entitlementPort,
        settingsPort,
        aiChatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new EmptyCatalogPort()))
    );

    @Test
    void askNotesUsesDefaultModelAndReturnsCitations() {
        settingsPort.settings = Optional.of(new AiModelSettings("user-1", "model-default", Map.of()));
        chunkRetrieval.results = List.of(
            new NoteChunkSearchResult(
                "user-1",
                "group-1",
                "note-1",
                "chunk-1",
                0,
                "RAG note",
                "RAG context from BrainX notes",
                0.92d,
                "hash-1",
                1,
                null,
                null
            )
        );

        var result = service.askNotes(new AskNotesCommand(
            "user-1",
            null,
            null,
            "How does BrainX search notes?",
            null,
            null
        ));

        assertThat(chunkRetrieval.lastQuery.scope()).isEqualTo(SearchScope.USER);
        assertThat(chunkRetrieval.lastQuery.documentGroupId()).isNull();
        assertThat(aiChatPort.lastRequest.modelId()).isEqualTo("model-default");
        assertThat(entitlementPort.requests).hasSize(1);
        assertThat(result.answer()).isEqualTo("Answer from notes");
        assertThat(result.citations()).hasSize(1);
        assertThat(result.citations().getFirst().noteId()).isEqualTo("note-1");
        assertThat(result.citations().getFirst().matchedType()).isEqualTo(SearchMatchType.SEMANTIC);
        assertThat(result.modelId()).isEqualTo("model-default");
        assertThat(result.charged()).isTrue();
        assertThat(result.tokenUsage().totalTokens()).isEqualTo(15);
        assertThat(tokenUsagePort.records).hasSize(1);
    }

    @Test
    void askNotesReturnsUnchargedFallbackWhenNoContextExists() {
        var result = service.askNotes(new AskNotesCommand(
            "user-1",
            null,
            null,
            "missing context",
            8,
            null
        ));

        assertThat(result.charged()).isFalse();
        assertThat(result.tokenEstimate()).isZero();
        assertThat(result.citations()).isEmpty();
        assertThat(aiChatPort.generateCalls).isZero();
        assertThat(entitlementPort.requests).isEmpty();
    }

    @Test
    void askNotesRejectsDocumentGroupWhenScopeIsUser() {
        assertThatThrownBy(() -> service.askNotes(new AskNotesCommand(
            "user-1",
            SearchScope.USER,
            "group-1",
            "question",
            8,
            "model"
        )))
            .isInstanceOf(ChatDomainException.class)
            .hasMessageContaining("documentGroupId");
    }

    private static final class FakeChunkRetrieval implements NoteChunkRetrievalPort {

        private List<NoteChunkSearchResult> results = List.of();
        private NoteChunkSearchQuery lastQuery;

        @Override
        public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
            this.lastQuery = query;
            return results;
        }
    }

    private static final class FakeEntitlementPort implements EntitlementPort {

        private final List<EntitlementRequest> requests = new ArrayList<>();

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            requests.add(request);
            return new EntitlementDecision(true, null, 100);
        }
    }

    private static final class FakeSettingsPort implements AiModelSettingsPort {

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

        private int generateCalls;
        private AiChatRequest lastRequest;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            generateCalls++;
            lastRequest = request;
            return new AiChatResponse("Answer from notes", new AiTokenUsage(10, 5, 15));
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

    private static final class EmptyCatalogPort implements AiModelCatalogPort {

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
}
