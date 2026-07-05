package com.brainx.intelligence.agent.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.brainx.intelligence.agent.application.port.outbound.AgentNoteSourcePort;
import com.brainx.intelligence.agent.application.port.outbound.AgentNoteSourcePort.AgentNoteSource;
import com.brainx.intelligence.agent.application.port.outbound.AgentPersistencePort;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentActionDecisionCommand;
import com.brainx.intelligence.agent.application.usecase.AgentService.CreateAgentThreadCommand;
import com.brainx.intelligence.agent.application.usecase.AgentService.SendAgentMessageCommand;
import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentConflictException;
import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentThread;
import com.brainx.intelligence.agent.domain.AgentThreadSummary;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementDecision;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class AgentServiceTest {

    private FakeAgentPersistence persistence;
    private FakeAiChat aiChat;
    private FakeWorkspace workspace;
    private FakeAgentNoteSourcePort notes;
    private AgentService service;

    @BeforeEach
    void setUp() {
        persistence = new FakeAgentPersistence();
        aiChat = new FakeAiChat();
        workspace = new FakeWorkspace();
        notes = new FakeAgentNoteSourcePort();
        service = new AgentService(
            persistence,
            aiChat,
            request -> new EntitlementDecision(true, null, 10_000),
            new AiUsageRecorder(record -> {
            }, new AiTokenUsageCostEstimator(new EmptyAiModelCatalog())),
            workspace,
            notes,
            new ObjectMapper()
        );
    }

    @Test
    void sendMessageProposesCreateNoteWithoutExecutingWorkspaceMutation() {
        AgentService.AgentThreadView thread = createThread();
        aiChat.response = """
            {"reply":"문서로 저장할 작업을 제안합니다.","action":{"type":"CREATE_NOTE","title":"대화 문서 저장","summary":"최근 대화를 새 노트로 저장합니다.","previewMarkdown":"# 대화 정리","target":{},"payload":{"title":"대화 정리","markdown":"# 대화 정리\\n\\n내용","tags":["agent"]}}}
            """;

        List<AgentService.AgentStreamEvent> events = service.sendMessage(new SendAgentMessageCommand(
            "user-1",
            thread.threadId(),
            "방금 대화 내용을 문서로 저장해줘",
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).extracting(AgentService.AgentStreamEvent::eventName)
            .containsExactly("delta", "action_proposed", "done");
        assertThat(persistence.actions).hasSize(1);
        assertThat(persistence.actions.getFirst().status()).isEqualTo(AgentActionStatus.PENDING_APPROVAL);
        assertThat(workspace.createdCommands).isEmpty();
    }

    @Test
    void approveCreateNoteExecutesWorkspaceCreateAndMarksSucceeded() {
        AgentAction action = pendingCreateNoteAction();
        persistence.saveAction(action);

        AgentService.AgentActionView result = service.approveAction(new AgentActionDecisionCommand("user-1", action.actionId()));

        assertThat(result.status()).isEqualTo(AgentActionStatus.SUCCEEDED);
        assertThat(result.result()).containsEntry("noteId", "created-note-1");
        assertThat(workspace.createdCommands).hasSize(1);
        assertThat(workspace.createdCommands.getFirst().markdown()).contains("# note");
    }

    @Test
    void approveCreateNoteNormalizesBlankTargetFolderIdToNull() {
        AgentAction action = pendingCreateNoteAction(Map.of(
            "title", "note",
            "markdown", "# note\n\nbody",
            "targetFolderId", "   "
        ));
        persistence.saveAction(action);

        AgentService.AgentActionView result = service.approveAction(new AgentActionDecisionCommand("user-1", action.actionId()));

        assertThat(result.status()).isEqualTo(AgentActionStatus.SUCCEEDED);
        assertThat(workspace.createdCommands).hasSize(1);
        assertThat(workspace.createdCommands.getFirst().targetFolderId()).isNull();
    }

    @Test
    void approveCreateNoteClaimsPendingActionOnlyOnce() {
        AgentAction action = pendingCreateNoteAction();
        persistence.saveAction(action);

        AgentService.AgentActionView first = service.approveAction(new AgentActionDecisionCommand("user-1", action.actionId()));

        assertThat(first.status()).isEqualTo(AgentActionStatus.SUCCEEDED);
        assertThatThrownBy(() -> service.approveAction(new AgentActionDecisionCommand("user-1", action.actionId())))
            .isInstanceOf(AgentConflictException.class);
        assertThat(workspace.createdCommands).hasSize(1);
    }

    @Test
    void rejectPendingActionDoesNotExecuteWorkspaceMutation() {
        AgentAction action = pendingCreateNoteAction();
        persistence.saveAction(action);

        AgentService.AgentActionView result = service.rejectAction(new AgentActionDecisionCommand("user-1", action.actionId()));

        assertThat(result.status()).isEqualTo(AgentActionStatus.REJECTED);
        assertThat(workspace.createdCommands).isEmpty();
    }

    @Test
    void approveAppendNoteVerifiesUserProjectionAndUsesLatestWorkspaceVersion() {
        AgentAction action = pendingAppendAction();
        persistence.saveAction(action);
        notes.saved = new AgentNoteSource("note-1", "대상 노트");
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            "대상 노트",
            "기존 내용",
            List.of(),
            null,
            7,
            Instant.parse("2026-07-06T00:01:00Z")
        );

        AgentService.AgentActionView result = service.approveAction(new AgentActionDecisionCommand("user-1", action.actionId()));

        assertThat(result.status()).isEqualTo(AgentActionStatus.SUCCEEDED);
        assertThat(workspace.appendCommands).hasSize(1);
        assertThat(workspace.appendCommands.getFirst().baseVersion()).isEqualTo(7);
        assertThat(workspace.appendCommands.getFirst().appendMarkdown()).contains("추가 내용");
    }

    @Test
    void plannerUnknownToolIsIgnored() {
        AgentService.AgentThreadView thread = createThread();
        aiChat.response = """
            {"reply":"삭제 작업은 지원하지 않습니다.","action":{"type":"DELETE_NOTE","title":"삭제","summary":"삭제","previewMarkdown":"","target":{},"payload":{"noteId":"note-1"}}}
            """;

        List<AgentService.AgentStreamEvent> events = service.sendMessage(new SendAgentMessageCommand(
            "user-1",
            thread.threadId(),
            "이 노트를 삭제해줘",
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).extracting(AgentService.AgentStreamEvent::eventName)
            .containsExactly("delta", "done");
        assertThat(persistence.actions).isEmpty();
    }

    private AgentService.AgentThreadView createThread() {
        return service.createThread(new CreateAgentThreadCommand(
            "user-1",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            "테스트 Agent",
            null,
            "gpt-test"
        ));
    }

    private static AgentAction pendingCreateNoteAction() {
        return pendingCreateNoteAction(Map.of("title", "note", "markdown", "# note\n\nbody"));
    }

    private static AgentAction pendingCreateNoteAction(Map<String, Object> payload) {
        return new AgentAction(
            "action-1",
            "user-1",
            "thread-1",
            "message-1",
            com.brainx.intelligence.agent.domain.AgentActionType.CREATE_NOTE,
            AgentActionStatus.PENDING_APPROVAL,
            "새 노트 생성",
            "새 노트를 만듭니다.",
            "# 새 노트",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            Map.of(),
            payload,
            null,
            null,
            Instant.now(),
            null,
            null
        );
    }

    private static AgentAction pendingAppendAction() {
        return new AgentAction(
            "action-2",
            "user-1",
            "thread-1",
            "message-1",
            com.brainx.intelligence.agent.domain.AgentActionType.APPEND_NOTE_CONTENT,
            AgentActionStatus.PENDING_APPROVAL,
            "노트에 추가",
            "기존 노트에 내용을 추가합니다.",
            "추가 내용",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            Map.of("noteId", "note-1"),
            Map.of("noteId", "note-1", "appendMarkdown", "\n\n추가 내용"),
            null,
            null,
            Instant.now(),
            null,
            null
        );
    }

    private static final class FakeAgentPersistence implements AgentPersistencePort {

        private final List<AgentThread> threads = new ArrayList<>();
        private final List<AgentMessage> messages = new ArrayList<>();
        private final List<AgentAction> actions = new ArrayList<>();

        @Override
        public AgentThread saveThread(AgentThread thread) {
            threads.removeIf(item -> item.threadId().equals(thread.threadId()));
            threads.add(thread);
            return thread;
        }

        @Override
        public Optional<AgentThread> findThreadByUserIdAndThreadId(String userId, String threadId) {
            return threads.stream()
                .filter(thread -> thread.userId().equals(userId) && thread.threadId().equals(threadId))
                .findFirst();
        }

        @Override
        public List<AgentThreadSummary> findThreadSummariesByUserId(String userId, int limit) {
            return threads.stream()
                .filter(thread -> thread.userId().equals(userId))
                .map(thread -> {
                    List<AgentMessage> threadMessages = messages.stream()
                        .filter(message -> message.threadId().equals(thread.threadId()))
                        .sorted(Comparator.comparing(AgentMessage::createdAt))
                        .toList();
                    AgentMessage latest = threadMessages.isEmpty() ? null : threadMessages.getLast();
                    return new AgentThreadSummary(
                        thread.threadId(),
                        thread.userId(),
                        thread.documentGroupId(),
                        thread.title(),
                        thread.modelId(),
                        thread.createdAt(),
                        latest == null ? thread.createdAt() : latest.createdAt(),
                        latest == null ? null : latest.content(),
                        threadMessages.size()
                    );
                })
                .limit(limit)
                .toList();
        }

        @Override
        public AgentMessage saveMessage(AgentMessage message) {
            messages.removeIf(item -> item.messageId().equals(message.messageId()));
            messages.add(message);
            return message;
        }

        @Override
        public List<AgentMessage> findMessagesByUserIdAndThreadId(String userId, String threadId) {
            return messages.stream()
                .filter(message -> message.userId().equals(userId) && message.threadId().equals(threadId))
                .sorted(Comparator.comparing(AgentMessage::createdAt))
                .toList();
        }

        @Override
        public AgentAction saveAction(AgentAction action) {
            actions.removeIf(item -> item.actionId().equals(action.actionId()));
            actions.add(action);
            return action;
        }

        @Override
        public Optional<AgentAction> findActionByUserIdAndActionId(String userId, String actionId) {
            return actions.stream()
                .filter(action -> action.userId().equals(userId) && action.actionId().equals(actionId))
                .findFirst();
        }

        @Override
        public Optional<AgentAction> claimPendingActionForExecution(String userId, String actionId, Instant decidedAt) {
            Optional<AgentAction> found = findActionByUserIdAndActionId(userId, actionId)
                .filter(AgentAction::pendingApproval);
            found.ifPresent(action -> saveAction(action
                .withStatus(AgentActionStatus.APPROVED, decidedAt)
                .withStatus(AgentActionStatus.EXECUTING, decidedAt)));
            return findActionByUserIdAndActionId(userId, actionId)
                .filter(action -> action.status() == AgentActionStatus.EXECUTING);
        }

        @Override
        public Optional<AgentAction> rejectPendingAction(String userId, String actionId, Instant decidedAt) {
            Optional<AgentAction> found = findActionByUserIdAndActionId(userId, actionId)
                .filter(AgentAction::pendingApproval);
            found.ifPresent(action -> saveAction(action.withStatus(AgentActionStatus.REJECTED, decidedAt)));
            return findActionByUserIdAndActionId(userId, actionId)
                .filter(action -> action.status() == AgentActionStatus.REJECTED);
        }

        @Override
        public List<AgentAction> findActionsByUserIdAndThreadId(String userId, String threadId) {
            return actions.stream()
                .filter(action -> action.userId().equals(userId) && action.threadId().equals(threadId))
                .toList();
        }
    }

    private static final class FakeAiChat implements AiChatPort {

        private String response = "{\"reply\":\"확인했습니다.\",\"action\":null}";

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            return new AiChatResponse(response, new AiTokenUsage(10, 4, 14));
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static final class FakeWorkspace implements WorkspaceNotePort {

        private final List<CreateNoteCommand> createdCommands = new ArrayList<>();
        private final List<AppendNoteContentCommand> appendCommands = new ArrayList<>();
        private NoteSnapshot snapshot = new NoteSnapshot("note-1", "대상 노트", "기존 내용", Instant.now());

        @Override
        public NoteSnapshot getNoteSnapshot(String noteId) {
            return snapshot;
        }

        @Override
        public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        }

        @Override
        public CreatedNote createNoteFromAgent(CreateNoteCommand command) {
            createdCommands.add(command);
            return new CreatedNote("created-note-1", 1);
        }

        @Override
        public NoteContentPatchResult appendNoteContentFromAgent(AppendNoteContentCommand command) {
            appendCommands.add(command);
            return new NoteContentPatchResult(command.noteId(), command.baseVersion() + 1, Instant.now());
        }
    }

    private static final class FakeAgentNoteSourcePort implements AgentNoteSourcePort {

        private AgentNoteSource saved;

        @Override
        public Optional<AgentNoteSource> findSearchableAgentNoteSource(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            if (saved == null) {
                return Optional.empty();
            }
            return "user-1".equals(userId)
                && DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID.equals(DocumentGroups.normalize(documentGroupId))
                && saved.noteId().equals(noteId)
                ? Optional.of(saved)
                : Optional.empty();
        }
    }

    private static final class EmptyAiModelCatalog implements AiModelCatalogPort {

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
