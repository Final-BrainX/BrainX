package com.brainx.intelligence.chat.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.CreateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ListChatThreadsQuery;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort.ChatThreadSummaryCursor;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatRole;
import com.brainx.intelligence.chat.domain.ChatRoute;
import com.brainx.intelligence.chat.domain.ChatRouteDecision;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatThreadSummary;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

import reactor.core.publisher.Flux;

class ChatServiceTest {

    private static final String SUFFICIENT_CLIENT_CONTEXT =
        "프론트가 선택한 문맥은 사용자의 질문에 답할 수 있을 만큼 충분한 본문을 포함한다. "
            + "현재 노트의 핵심 흐름, 관련 개념, 설명에 필요한 근거 문장을 함께 제공한다.";

    private final ChatProperties properties = new ChatProperties();
    private final FakeChatRouteDecider routeDecider = new FakeChatRouteDecider();
    private final FakeChatPersistencePort persistencePort = new FakeChatPersistencePort();
    private final FakeNoteChunkRetrievalPort retrievalPort = new FakeNoteChunkRetrievalPort();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiChatPort aiChatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeAiModelCatalogPort catalogPort = new FakeAiModelCatalogPort();
    private final FakeChatEventPort chatEventPort = new FakeChatEventPort();
    private final ChatService service = new ChatService(
        properties,
        routeDecider,
        persistencePort,
        retrievalPort,
        entitlementPort,
        aiChatPort,
        tokenUsagePort,
        new AiTokenUsageCostEstimator(catalogPort),
        chatEventPort
    );

    @BeforeEach
    void setUp() {
        catalogPort.model = new AiModel(
            "gpt-test",
            "GPT test",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.010000"),
                new BigDecimal("0.002000"),
                new BigDecimal("0.030000"),
                "usd"
            )
        );
        aiChatPort.chunks = Flux.just(
            new AiChatChunk("답변 ", false),
            new AiChatChunk("완료", false),
            new AiChatChunk("", true)
        );
        routeDecider.decision = new ChatRouteDecision(ChatRoute.NOTE_QA, "note question", "gpt-5.4-nano");
    }

    @Test
    void createChatThreadDefaultsDocumentGroupAndPublishesEvent() {
        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "RAG 질문",
            "gpt-test"
        ));

        assertThat(result.documentGroupId()).isEqualTo("default");
        assertThat(result.title()).isEqualTo("RAG 질문");
        assertThat(result.modelId()).isEqualTo("gpt-test");
        assertThat(persistencePort.threads).hasSize(1);
        assertThat(chatEventPort.threadEvents).hasSize(1);
        assertThat(chatEventPort.threadEvents.getFirst().threadId()).isEqualTo(result.threadId());
    }

    @Test
    void listChatThreadsUsesRecentMessageOrderAndCursorPagination() {
        persistencePort.saveThread(new ChatThread(
            "thread-1",
            "user-1",
            "default",
            "첫 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:00:00Z")
        ));
        persistencePort.saveThread(new ChatThread(
            "thread-2",
            "user-1",
            "default",
            "최근 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:02:00Z")
        ));
        persistencePort.saveThread(new ChatThread(
            "thread-other",
            "user-2",
            "default",
            "다른 사용자",
            "gpt-test",
            Instant.parse("2026-06-23T00:03:00Z")
        ));
        persistencePort.saveMessage(ChatMessage.user(
            "message-1",
            "thread-1",
            "user-1",
            "오래된 질문",
            "gpt-test",
            Map.of(),
            Map.of(),
            Instant.parse("2026-06-23T00:01:00Z")
        ));
        persistencePort.saveMessage(ChatMessage.assistant(
            "message-2",
            "thread-1",
            "user-1",
            "최근 답변 ".repeat(30),
            "gpt-test",
            List.of(),
            null,
            Instant.parse("2026-06-23T00:04:00Z")
        ));

        var firstPage = service.listChatThreads(new ListChatThreadsQuery("user-1", 1, null));

        assertThat(firstPage.threads()).hasSize(1);
        assertThat(firstPage.threads().getFirst().threadId()).isEqualTo("thread-1");
        assertThat(firstPage.threads().getFirst().lastMessageAt()).isEqualTo(Instant.parse("2026-06-23T00:04:00Z"));
        assertThat(firstPage.threads().getFirst().lastMessagePreview()).hasSizeLessThanOrEqualTo(160);
        assertThat(firstPage.threads().getFirst().messageCount()).isEqualTo(2);
        assertThat(firstPage.pagination().hasMore()).isTrue();
        assertThat(firstPage.pagination().nextCursor()).isNotBlank();

        var secondPage = service.listChatThreads(new ListChatThreadsQuery(
            "user-1",
            10,
            firstPage.pagination().nextCursor()
        ));

        assertThat(secondPage.threads()).extracting("threadId").containsExactly("thread-2");
        assertThat(secondPage.threads().getFirst().messageCount()).isZero();
        assertThat(secondPage.pagination().hasMore()).isFalse();
    }

    @Test
    void listChatThreadsRejectsInvalidCursor() {
        assertThatThrownBy(() -> service.listChatThreads(new ListChatThreadsQuery(
            "user-1",
            10,
            "not-a-cursor"
        )))
            .isInstanceOf(ChatDomainException.class)
            .hasMessage("Invalid chat thread cursor.");
    }

    @Test
    void sendMessageStreamsDeltasAndPersistsAssistantWithUsageAndCitations() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        retrievalPort.results = List.of(
            new NoteChunkSearchResult(
                "user-1",
                "group-1",
                "note-1",
                "note-1::0",
                0,
                "RAG note",
                "context text",
                0.91d,
                "hash",
                1,
                "docs/rag.md",
                "rag.md"
            )
        );

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of("documentGroupId", "group-1"),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(4);
        assertThat(events.get(0).eventName()).isEqualTo("route");
        assertThat(events.get(0).data()).containsEntry("route", "NOTE_QA");
        assertThat(events.get(0).data()).containsEntry("routerModel", "gpt-5.4-nano");
        assertThat(events.get(1).eventName()).isEqualTo("delta");
        assertThat(events.get(1).data()).containsEntry("text", "답변 ");
        assertThat(events.get(2).data()).containsEntry("text", "완료");
        assertThat(events.get(3).eventName()).isEqualTo("done");
        assertThat(retrievalPort.lastQuery.scope()).isEqualTo(SearchScope.DOCUMENT_GROUP);
        assertThat(retrievalPort.lastQuery.documentGroupId()).isEqualTo("group-1");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("RAG_CHAT");
        assertThat(aiChatPort.lastRequest.modelId()).isEqualTo("gpt-test");
        assertThat(aiChatPort.lastRequest.messages().getLast().content())
            .contains("RAG란?")
            .contains("context text")
            .contains("sourcePath=docs/rag.md");

        assertThat(persistencePort.messages).hasSize(2);
        ChatMessage userMessage = persistencePort.messages.get(0);
        ChatMessage assistantMessage = persistencePort.messages.get(1);
        assertThat(userMessage.role()).isEqualTo(ChatRole.USER);
        assertThat(assistantMessage.role()).isEqualTo(ChatRole.ASSISTANT);
        assertThat(assistantMessage.content()).isEqualTo("답변 완료");
        assertThat(assistantMessage.citations()).hasSize(1);
        assertThat(assistantMessage.tokenUsage()).isNotNull();

        assertThat(chatEventPort.messageEvents).hasSize(1);
        assertThat(chatEventPort.messageEvents.getFirst().citationNoteIds()).containsExactly("note-1");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("rag-chat");
        assertThat(tokenUsagePort.records.getFirst().modelId()).isEqualTo("gpt-test");
        assertThat(tokenUsagePort.records.getFirst().estimatedCost()).isNotNull();
    }

    @Test
    void clientContextSkipsRetrievalAndIsUsedInPrompt() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var clientContext = Map.<String, Object>of(
            "mode", "SELECTION",
            "source", "RIGHT_SIDEBAR",
            "items", List.of(Map.of(
                "type", "SELECTION",
                "noteId", "note-1",
                "documentGroupId", "group-1",
                "text", SUFFICIENT_CLIENT_CONTEXT
            ))
        );

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "선택 영역을 설명해줘",
            Map.of("documentGroupId", "group-1"),
            clientContext,
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(4);
        assertThat(events.getFirst().eventName()).isEqualTo("route");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("note sidebar")
            .contains("unrelated to the provided note context")
            .contains("do not answer the external question");
        assertThat(aiChatPort.lastRequest.messages().getLast().content())
            .contains("Frontend selected context")
            .contains("mode=SELECTION")
            .contains("source=RIGHT_SIDEBAR")
            .contains("type=SELECTION")
            .contains(SUFFICIENT_CLIENT_CONTEXT);
        assertThat(persistencePort.messages.getFirst().clientContext())
            .containsEntry("mode", "SELECTION")
            .containsEntry("source", "RIGHT_SIDEBAR");
    }

    @Test
    void rightSidebarClientContextTooShortReturnsFixedAnswerWithoutAiCall() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var clientContext = Map.<String, Object>of(
            "mode", "NOTE_EXCERPT",
            "source", "RIGHT_SIDEBAR",
            "items", List.of(
                Map.of(
                    "type", "NOTE_TITLE",
                    "noteId", "note-1",
                    "documentGroupId", "group-1",
                    "text", "짧은 노트"
                ),
                Map.of(
                    "type", "NOTE_TEXT",
                    "noteId", "note-1",
                    "documentGroupId", "group-1",
                    "text", "너무 짧음"
                )
            )
        );

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "이 노트를 설명해줘",
            Map.of("documentGroupId", "group-1"),
            clientContext,
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(3);
        assertThat(events.getFirst().eventName()).isEqualTo("route");
        assertThat(events.get(1).eventName()).isEqualTo("delta");
        assertThat(events.get(1).data().get("text")).asString().contains("현재 제공된 노트 내용이 너무 짧아");
        assertThat(events.get(2).eventName()).isEqualTo("done");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages.get(1).content()).contains("본문이나 선택 영역을 더 제공");
    }

    @Test
    void workspaceClientContextDoesNotUseSidebarScopeGuard() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var clientContext = Map.<String, Object>of(
            "mode", "NONE",
            "source", "WORKSPACE_CHAT",
            "items", List.of(Map.of(
                "type", "NOTE_TEXT",
                "text", "워크스페이스 채팅 문맥"
            ))
        );

        service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "글 초안을 작성해줘",
            Map.of("documentGroupId", "group-1"),
            clientContext,
            "gpt-test"
        )).collectList().block();

        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .doesNotContain("note sidebar")
            .doesNotContain("do not answer the external question");
    }

    @Test
    void workspaceSearchUsesUserWideRetrieval() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.WORKSPACE_SEARCH, "search all notes", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        retrievalPort.results = List.of(new NoteChunkSearchResult(
            "user-1",
            "group-2",
            "note-2",
            "note-2::0",
            0,
            "Other group note",
            "workspace context",
            0.91d,
            "hash",
            1,
            null,
            null
        ));

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "내 노트 전체에서 인증 관련 내용을 찾아줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events.getFirst().data()).containsEntry("route", "WORKSPACE_SEARCH");
        assertThat(retrievalPort.lastQuery.scope()).isEqualTo(SearchScope.USER);
        assertThat(retrievalPort.lastQuery.documentGroupId()).isNull();
        assertThat(aiChatPort.lastRequest.messages().getLast().content()).contains("workspace context");
        assertThat(persistencePort.messages.get(1).citations().getFirst().documentGroupId()).isEqualTo("group-2");
    }

    @Test
    void composeAllowsGenerationWithoutRetrievedContext() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.COMPOSE, "write draft", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "블로그 초안을 써줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events.getFirst().data()).containsEntry("route", "COMPOSE");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content()).contains("writing assistant");
        assertThat(aiChatPort.lastRequest.messages().getLast().content()).contains("Request:");
    }

    @Test
    void noteActionReturnsDraftWithoutWorkspaceMutation() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.NOTE_ACTION, "draft note action", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "방금 답변을 노트에 추가할 초안으로 만들어줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events.getFirst().data()).containsEntry("route", "NOTE_ACTION");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("note action draft assistant")
            .contains("Do not claim that anything was saved");
    }

    @Test
    void outOfScopeReturnsFixedAnswerWithoutRetrievalOrAnswerAi() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.OUT_OF_SCOPE, "weather", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "오늘 날씨 어때?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(3);
        assertThat(events.getFirst().data()).containsEntry("route", "OUT_OF_SCOPE");
        assertThat(events.get(1).data().get("text")).asString().contains("BrainX 본 채팅");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages.get(1).content()).contains("BrainX 본 채팅");
    }

    @Test
    void emptyContextSkipsAiCallAndStoresNoContextAnswer() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "없는 내용?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(3);
        assertThat(events.getFirst().eventName()).isEqualTo("route");
        assertThat(events.get(1).eventName()).isEqualTo("delta");
        assertThat(events.get(1).data().get("text")).asString().contains("관련 노트 근거");
        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages).hasSize(2);
        assertThat(persistencePort.messages.get(1).role()).isEqualTo(ChatRole.ASSISTANT);
        assertThat(chatEventPort.messageEvents).hasSize(1);
        assertThat(tokenUsagePort.records).hasSize(1);
    }

    @Test
    void entitlementDeniedStopsBeforeAiCallButKeepsUserMessage() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        retrievalPort.results = List.of(new NoteChunkSearchResult(
            "user-1",
            "group-1",
            "note-1",
            "note-1::0",
            0,
            "RAG note",
            "context",
            0.9d,
            "hash",
            1,
            null,
            null
        ));
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";

        assertThatThrownBy(() -> service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )))
            .isInstanceOf(ChatDomainException.class)
            .hasMessageContaining("QUOTA_EXHAUSTED");

        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages).hasSize(1);
        assertThat(chatEventPort.messageEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    @Test
    void noteScopeDocumentGroupMustMatchThread() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        assertThatThrownBy(() -> service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of("documentGroupId", "other-group"),
            Map.of(),
            "gpt-test"
        )))
            .isInstanceOf(ChatDomainException.class)
            .hasMessageContaining("noteScope.documentGroupId");
    }

    @Test
    void streamFailureEmitsErrorEventAndDoesNotStoreAssistantMessage() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        retrievalPort.results = List.of(new NoteChunkSearchResult(
            "user-1",
            "group-1",
            "note-1",
            "note-1::0",
            0,
            "RAG note",
            "context",
            0.9d,
            "hash",
            1,
            null,
            null
        ));
        aiChatPort.chunks = Flux.concat(
            Flux.just(new AiChatChunk("partial", false)),
            Flux.error(new IllegalStateException("provider down"))
        );

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(3);
        assertThat(events.getFirst().eventName()).isEqualTo("route");
        assertThat(events.get(1).eventName()).isEqualTo("delta");
        assertThat(events.get(2).eventName()).isEqualTo("error");
        assertThat(events.get(2).data()).containsEntry("code", "STREAM_ERROR");
        assertThat(persistencePort.messages).hasSize(1);
        assertThat(chatEventPort.messageEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    private static ChatThread existingThread() {
        return new ChatThread("thread-1", "user-1", "group-1", "RAG 질문", "gpt-test", null);
    }

    private static final class FakeChatPersistencePort implements ChatPersistencePort {

        private final List<ChatThread> threads = new ArrayList<>();
        private final List<ChatMessage> messages = new ArrayList<>();

        @Override
        public ChatThread saveThread(ChatThread thread) {
            threads.add(thread);
            return thread;
        }

        @Override
        public Optional<ChatThread> findThreadByUserIdAndThreadId(String userId, String threadId) {
            return threads.stream()
                .filter(thread -> thread.userId().equals(userId) && thread.threadId().equals(threadId))
                .findFirst();
        }

        @Override
        public List<ChatThreadSummary> findThreadSummariesByUserId(
            String userId,
            ChatThreadSummaryCursor cursor,
            int limit
        ) {
            return threads.stream()
                .filter(thread -> thread.userId().equals(userId))
                .map(thread -> toSummary(thread, messages.stream()
                    .filter(message -> message.userId().equals(userId) && message.threadId().equals(thread.threadId()))
                    .sorted(Comparator.comparing(ChatMessage::createdAt))
                    .toList()))
                .sorted(Comparator
                    .comparing(ChatThreadSummary::lastMessageAt, Comparator.reverseOrder())
                    .thenComparing(ChatThreadSummary::threadId, Comparator.reverseOrder()))
                .filter(summary -> cursor == null
                    || summary.lastMessageAt().isBefore(cursor.lastMessageAt())
                    || (summary.lastMessageAt().equals(cursor.lastMessageAt())
                        && summary.threadId().compareTo(cursor.threadId()) < 0))
                .limit(limit)
                .toList();
        }

        @Override
        public ChatMessage saveMessage(ChatMessage message) {
            messages.add(message);
            return message;
        }

        @Override
        public List<ChatMessage> findMessagesByUserIdAndThreadId(String userId, String threadId) {
            return messages.stream()
                .filter(message -> message.userId().equals(userId) && message.threadId().equals(threadId))
                .sorted(Comparator.comparing(ChatMessage::createdAt))
                .toList();
        }

        private static ChatThreadSummary toSummary(ChatThread thread, List<ChatMessage> threadMessages) {
            Instant threadCreatedAt = thread.createdAt() == null ? Instant.EPOCH : thread.createdAt();
            ChatMessage lastMessage = threadMessages.isEmpty() ? null : threadMessages.getLast();
            return new ChatThreadSummary(
                thread.threadId(),
                thread.userId(),
                thread.documentGroupId(),
                thread.title(),
                thread.modelId(),
                threadCreatedAt,
                lastMessage == null ? threadCreatedAt : lastMessage.createdAt(),
                lastMessage == null ? null : lastMessage.content(),
                threadMessages.size()
            );
        }
    }

    private static final class FakeChatRouteDecider implements ChatRouteDecider {

        private ChatRouteDecision decision = new ChatRouteDecision(ChatRoute.NOTE_QA, "note question", "gpt-5.4-nano");
        private ChatRouteRequest lastRequest;

        @Override
        public ChatRouteDecision decide(ChatRouteRequest request) {
            lastRequest = request;
            return decision;
        }
    }

    private static final class FakeNoteChunkRetrievalPort implements NoteChunkRetrievalPort {

        private List<NoteChunkSearchResult> results = List.of();
        private NoteChunkSearchQuery lastQuery;

        @Override
        public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
            lastQuery = query;
            return results;
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
        private Flux<AiChatChunk> chunks = Flux.empty();

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            return new AiChatResponse("", null);
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            calls++;
            lastRequest = request;
            return chunks;
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

    private static final class FakeChatEventPort implements ChatEventPort {

        private final List<ChatThreadCreatedEvent> threadEvents = new ArrayList<>();
        private final List<ChatMessageCreatedEvent> messageEvents = new ArrayList<>();

        @Override
        public void chatThreadCreated(ChatThreadCreatedEvent event) {
            threadEvents.add(event);
        }

        @Override
        public void chatMessageCreated(ChatMessageCreatedEvent event) {
            messageEvents.add(event);
        }
    }
}
