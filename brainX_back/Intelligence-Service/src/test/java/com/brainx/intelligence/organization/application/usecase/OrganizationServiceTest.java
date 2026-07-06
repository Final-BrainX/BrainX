package com.brainx.intelligence.organization.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalCommand;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalResult;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort.FolderOrganizationProposalCreatedEvent;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort.OrganizationNoteSource;
import com.brainx.intelligence.organization.domain.OrganizationConflictException;
import com.brainx.intelligence.organization.domain.OrganizationForbiddenException;
import com.brainx.intelligence.organization.domain.OrganizationNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationProviderUnavailableException;
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
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementDecision;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class OrganizationServiceTest {

    private final FakeOrganizationNoteSource noteSource = new FakeOrganizationNoteSource();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiModelSettingsPort settingsPort = new FakeAiModelSettingsPort();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeOrganizationEventPort eventPort = new FakeOrganizationEventPort();
    private final OrganizationProperties properties = new OrganizationProperties();
    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler stylePromptCompiler = new StylePromptCompiler(styleProfilePort);
    private final LlmOpsStore llmOpsStore = LlmOpsTestSupport.store();
    private final OrganizationService service = new OrganizationService(
        noteSource,
        entitlementPort,
        settingsPort,
        chatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new EmptyAiModelCatalogPort())),
        LlmOpsTestSupport.runRecorder(llmOpsStore),
        LlmOpsTestSupport.promptRegistry(llmOpsStore),
        eventPort,
        properties,
        stylePromptCompiler,
        new ObjectMapper()
    );

    @Test
    void createProposalUsesDefaultDocumentGroupAndUserModel() {
        settingsPort.settings = Optional.of(new AiModelSettings("user-1", "gpt-user", Map.of()));
        styleProfilePort.profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("warmth", "warm", "directness", "high")),
            new WritingStyle(Map.of("formality", "business")),
            null
        );
        noteSource.allNotes = List.of(
            note("note-1", "folder-a", "Spring", List.of("backend"), List.of("Boot"), "sanitized Spring excerpt"),
            note("note-2", "folder-b", "Database", List.of("sql"), List.of("Index"), "PostgreSQL excerpt")
        );
        chatPort.response = new AiChatResponse(
            """
                {
                  "proposedFolders": [
                    {"name":"Backend", "noteIds":["note-1", "missing"], "reason":"related backend notes"}
                  ],
                  "proposedMoves": [
                    {"noteId":"note-2", "targetFolderName":"Backend", "reason":"move close to Spring"}
                  ]
                }
                """,
            new AiTokenUsage(80, 20, 100, 10, 3)
        );

        FolderOrganizationProposalResult result = service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "all", null)
        );

        assertThat(result.proposalId()).isNotBlank();
        assertThat(result.proposedFolders()).hasSize(1);
        assertThat(result.proposedFolders().getFirst()).containsEntry("name", "Backend");
        assertThat(result.proposedFolders().getFirst().get("noteIds")).isEqualTo(List.of("note-1"));
        assertThat(result.proposedMoves()).hasSize(1);
        assertThat(result.proposedMoves().getFirst()).containsEntry("noteId", "note-2");
        assertThat(noteSource.lastDocumentGroupId).isEqualTo("default");
        assertThat(noteSource.lastAllLimit).isEqualTo(50);
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("gpt-user");
        assertThat(chatPort.lastRequest.messages().getFirst().content())
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Keep the directness level: high")
            .doesNotContain("every final generated or edited user-facing text segment");
        assertThat(chatPort.lastRequest.messages().get(1).content())
            .contains("sanitized Spring excerpt")
            .doesNotContain("markdown");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("FOLDER_ORGANIZATION");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("folder-organization");
        assertThat(tokenUsagePort.records.getFirst().inputTokens()).isEqualTo(80);
        assertThat(tokenUsagePort.records.getFirst().cachedInputTokens()).isEqualTo(10);
        assertThat(tokenUsagePort.records.getFirst().reasoningTokens()).isEqualTo(3);
        assertThat(tokenUsagePort.records.getFirst().causationId()).isEqualTo(result.proposalId());
        assertThat(eventPort.createdEvents).hasSize(1);
        assertThat(eventPort.createdEvents.getFirst().suggestionId()).isEqualTo(result.proposalId());
        assertThat(eventPort.createdEvents.getFirst().featureId()).isEqualTo("folder-organization");
        assertThat(eventPort.createdEvents.getFirst().noteId()).isNull();
    }

    @Test
    void folderScopeRequiresFolderId() {
        assertThatThrownBy(() -> service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "folder", " ")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("folderId");

        assertThat(chatPort.generateCalls).isZero();
    }

    @Test
    void noNotesMapsToConflictForAllScopeAndNotFoundForFolderScope() {
        assertThatThrownBy(() -> service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "all", null)
        ))
            .isInstanceOf(OrganizationConflictException.class);

        assertThatThrownBy(() -> service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "folder", "folder-a")
        ))
            .isInstanceOf(OrganizationNotFoundException.class);
    }

    @Test
    void entitlementDeniedStopsBeforeAiCall() {
        noteSource.allNotes = List.of(note("note-1", "folder-a", "Spring", List.of(), List.of(), "excerpt"));
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "all", null)
        ))
            .isInstanceOf(OrganizationForbiddenException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(chatPort.generateCalls).isZero();
        assertThat(tokenUsagePort.records).isEmpty();
        assertThat(eventPort.createdEvents).isEmpty();
    }

    @Test
    void folderScopeUsesFolderQueryAndFallbackModel() {
        properties.setDefaultModel("gpt-organization");
        noteSource.folderNotes = List.of(note("note-1", "folder-a", "Spring", List.of(), List.of(), "excerpt"));
        chatPort.response = new AiChatResponse("not json", null);

        FolderOrganizationProposalResult result = service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "folder", "folder-a")
        );

        assertThat(result.proposedFolders()).isEmpty();
        assertThat(result.proposedMoves()).isEmpty();
        assertThat(noteSource.lastFolderId).isEqualTo("folder-a");
        assertThat(noteSource.lastDocumentGroupId).isEqualTo("default");
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("gpt-organization");
        assertThat(tokenUsagePort.records).isEmpty();
        assertThat(eventPort.createdEvents).hasSize(1);
    }

    @Test
    void invalidProposalItemsAreFiltered() {
        noteSource.allNotes = List.of(note("note-1", "folder-a", "Spring", List.of(), List.of(), "excerpt"));
        chatPort.response = new AiChatResponse(
            """
                {
                  "proposedFolders": [
                    {"name":"", "noteIds":["note-1"]},
                    {"name":"Valid", "noteIds":["note-1"]}
                  ],
                  "proposedMoves": [
                    {"noteId":"missing", "targetFolderName":"Valid"},
                    {"noteId":"note-1"},
                    {"noteId":"note-1", "targetFolderName":"Valid"}
                  ]
                }
                """,
            null
        );

        FolderOrganizationProposalResult result = service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "all", null)
        );

        assertThat(result.proposedFolders()).extracting(item -> item.get("name")).containsExactly("Valid");
        assertThat(result.proposedMoves()).extracting(item -> item.get("noteId")).containsExactly("note-1");
    }

    @Test
    void providerFailureMapsToUnavailableException() {
        noteSource.allNotes = List.of(note("note-1", "folder-a", "Spring", List.of(), List.of(), "excerpt"));
        chatPort.failure = new RuntimeException("provider down");

        assertThatThrownBy(() -> service.createFolderOrganizationProposal(
            new FolderOrganizationProposalCommand("user-1", "all", null)
        ))
            .isInstanceOf(OrganizationProviderUnavailableException.class);
    }

    private static OrganizationNoteSource note(
        String noteId,
        String folderId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt
    ) {
        return new OrganizationNoteSource(
            "user-1",
            "default",
            noteId,
            folderId,
            title,
            tags,
            headings,
            excerpt,
            Instant.parse("2026-06-26T00:00:00Z")
        );
    }

    private static class FakeOrganizationNoteSource implements OrganizationNoteSourcePort {
        private List<OrganizationNoteSource> allNotes = List.of();
        private List<OrganizationNoteSource> folderNotes = List.of();
        private String lastDocumentGroupId;
        private String lastFolderId;
        private int lastAllLimit;

        @Override
        public List<OrganizationNoteSource> findOrganizationSourceNotes(String userId, String documentGroupId, int limit) {
            lastDocumentGroupId = documentGroupId;
            lastAllLimit = limit;
            return allNotes.stream().limit(limit).toList();
        }

        @Override
        public List<OrganizationNoteSource> findOrganizationSourceNotesByFolder(
            String userId,
            String documentGroupId,
            String folderId,
            int limit
        ) {
            lastDocumentGroupId = documentGroupId;
            lastFolderId = folderId;
            return folderNotes.stream().limit(limit).toList();
        }
    }

    private static class FakeEntitlementPort implements EntitlementPort {
        private boolean allowed = true;
        private String reasonCode = "OK";
        private EntitlementRequest lastRequest;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            lastRequest = request;
            return new EntitlementDecision(allowed, reasonCode, 1000);
        }
    }

    private static class FakeAiModelSettingsPort implements AiModelSettingsPort {
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

    private static class FakeAiChatPort implements AiChatPort {
        private AiChatResponse response = new AiChatResponse("{}", null);
        private RuntimeException failure;
        private AiChatRequest lastRequest;
        private int generateCalls;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            if (failure != null) {
                throw failure;
            }
            lastRequest = request;
            generateCalls++;
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static class FakeTokenUsagePort implements TokenUsagePort {
        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static class FakeOrganizationEventPort implements OrganizationEventPort {
        private final List<FolderOrganizationProposalCreatedEvent> createdEvents = new ArrayList<>();

        @Override
        public void folderOrganizationProposalCreated(FolderOrganizationProposalCreatedEvent event) {
            createdEvents.add(event);
        }
    }

    private static class FakeStyleProfilePort implements StyleProfilePort {

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

    private static class EmptyAiModelCatalogPort implements AiModelCatalogPort {
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
