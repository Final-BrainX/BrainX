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
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.GetChatThreadQuery;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ListChatThreadsQuery;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase.RecordChatDraftNoteCommand;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.DeleteChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.UpdateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort.ChatThreadSummaryCursor;
import com.brainx.intelligence.chat.domain.ChatConflictException;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatNotFoundException;
import com.brainx.intelligence.chat.domain.ChatRole;
import com.brainx.intelligence.chat.domain.ChatRoute;
import com.brainx.intelligence.chat.domain.ChatRouteDecision;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatThreadSummary;
import com.brainx.intelligence.chat.domain.ChatThreadStatus;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.llmops.LlmOpsTestSupport;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.application.service.LlmFeedbackService;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchResponse;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

import reactor.core.publisher.Flux;

class ChatServiceTest {

    private static final String SUFFICIENT_CLIENT_CONTEXT =
        "프론트가 선택한 문맥은 사용자의 질문에 답할 수 있을 만큼 충분한 본문을 포함한다. "
            + "현재 노트의 핵심 흐름, 관련 개념, 설명에 필요한 근거 문장을 함께 제공한다.";

    private final ChatProperties properties = new ChatProperties();
    private final ChatTitleProperties titleProperties = new ChatTitleProperties();
    private final FakeChatRouteDecider routeDecider = new FakeChatRouteDecider();
    private final FakeChatPersistencePort persistencePort = new FakeChatPersistencePort();
    private final FakeNoteChunkRetrievalPort retrievalPort = new FakeNoteChunkRetrievalPort();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeExternalSearchPort externalSearchPort = new FakeExternalSearchPort();
    private final FakeAiChatPort aiChatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeAiModelCatalogPort catalogPort = new FakeAiModelCatalogPort();
    private final AiTokenUsageCostEstimator usageCostEstimator = new AiTokenUsageCostEstimator(catalogPort);
    private final AiUsageRecorder aiUsageRecorder = new AiUsageRecorder(tokenUsagePort, usageCostEstimator);
    private final LlmOpsStore llmOpsStore = LlmOpsTestSupport.store();
    private final FakeChatEventPort chatEventPort = new FakeChatEventPort();
    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler stylePromptCompiler = new StylePromptCompiler(styleProfilePort);
    private final ChatThreadTitleGenerator titleGenerator = new ChatThreadTitleGenerator(
        titleProperties,
        entitlementPort,
        aiChatPort,
        aiUsageRecorder
    );
    private final ChatService service = new ChatService(
        properties,
        titleGenerator,
        routeDecider,
        persistencePort,
        retrievalPort,
        entitlementPort,
        externalSearchPort,
        aiChatPort,
        usageCostEstimator,
        aiUsageRecorder,
        LlmOpsTestSupport.runRecorder(llmOpsStore),
        new LlmFeedbackService(llmOpsStore),
        LlmOpsTestSupport.promptRegistry(llmOpsStore),
        chatEventPort,
        stylePromptCompiler
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
        styleProfilePort.profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("directness", "high", "verbosity", "concise")),
            new WritingStyle(Map.of("formality", "business", "sentenceLength", "short")),
            null
        );
    }

    @Test
    void createChatThreadDefaultsDocumentGroupAndPublishesEvent() {
        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "RAG 질문",
            null,
            "gpt-test"
        ));

        assertThat(result.documentGroupId()).isEqualTo("default");
        assertThat(result.title()).isEqualTo("RAG 질문");
        assertThat(result.modelId()).isEqualTo("gpt-test");
        assertThat(aiChatPort.generateCalls).isZero();
        assertThat(persistencePort.threads).hasSize(1);
        assertThat(chatEventPort.threadEvents).hasSize(1);
        assertThat(chatEventPort.threadEvents.getFirst().threadId()).isEqualTo(result.threadId());
    }

    @Test
    void createChatThreadUsesAiGeneratedTitleFromInitialMessage() {
        aiChatPort.generateResponse = new AiChatResponse(
            "\"RAG 검색 전략\"",
            new AiTokenUsage(16, 4, 20)
        );

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            "group-1",
            "RAG와 검색을 어떻게 설계하면 좋을까?",
            "RAG와 semantic search를 같이 쓰는 검색 전략을 정리해줘",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("RAG 검색 전략");
        assertThat(persistencePort.threads.getFirst().title()).isEqualTo("RAG 검색 전략");
        assertThat(chatEventPort.threadEvents.getFirst().title()).isEqualTo("RAG 검색 전략");
        assertThat(aiChatPort.generateCalls).isEqualTo(1);
        assertThat(aiChatPort.lastGenerateRequest.modelId()).isEqualTo("gpt-5.4-nano");
        assertThat(aiChatPort.lastGenerateRequest.messages().getLast().content())
            .contains("RAG와 semantic search를 같이 쓰는 검색 전략을 정리해줘")
            .contains("최대 20자");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("chat-thread-title");
    }

    @Test
    void createChatThreadFallsBackWhenAiTitleIsBlank() {
        aiChatPort.generateResponse = new AiChatResponse("   ", new AiTokenUsage(16, 1, 17));

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "fallback title",
            "제목 생성이 비어도 대화를 만들어줘",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("fallback title");
        assertThat(aiChatPort.generateCalls).isEqualTo(1);
    }

    @Test
    void createChatThreadLimitsAiGeneratedTitleLength() {
        aiChatPort.generateResponse = new AiChatResponse(
            "abcdefghijklmnopqrstuvwxy",
            null
        );

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "fallback title",
            "긴 제목이 생성되는 상황",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("abcdefghijklmnopqrst");
    }

    @Test
    void createChatThreadFallsBackWhenAiTitleGenerationFails() {
        aiChatPort.generateException = new IllegalStateException("provider down");

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "fallback title",
            "제목 생성 실패 상황",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("fallback title");
        assertThat(aiChatPort.generateCalls).isEqualTo(1);
        assertThat(persistencePort.threads).hasSize(1);
    }

    @Test
    void createChatThreadFallsBackWhenAiTitleGenerationDisabled() {
        titleProperties.setEnabled(false);

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "fallback title",
            "AI 제목 생성 비활성 상태",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("fallback title");
        assertThat(aiChatPort.generateCalls).isZero();
    }

    @Test
    void createChatThreadFallsBackWhenTitleEntitlementDenied() {
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "quota_exceeded";

        var result = service.createChatThread(new CreateChatThreadCommand(
            "user-1",
            null,
            "fallback title",
            "AI 제목 권한 거부 상황",
            "gpt-test"
        ));

        assertThat(result.title()).isEqualTo("fallback title");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("RAG_CHAT");
        assertThat(aiChatPort.generateCalls).isZero();
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
    void listChatThreadsFiltersActiveAndArchived() {
        ChatThread active = persistencePort.saveThread(new ChatThread(
            "thread-active",
            "user-1",
            "default",
            "활성 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:00:00Z")
        ));
        ChatThread archived = persistencePort.saveThread(new ChatThread(
            "thread-archived",
            "user-1",
            "default",
            "보관 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:01:00Z")
        ));
        persistencePort.archiveThread(archived.userId(), archived.threadId(), Instant.parse("2026-06-23T00:02:00Z"));

        var activePage = service.listChatThreads(new ListChatThreadsQuery("user-1", 10, null, ChatThreadStatus.ACTIVE));
        var archivedPage = service.listChatThreads(new ListChatThreadsQuery("user-1", 10, null, ChatThreadStatus.ARCHIVED));

        assertThat(activePage.threads()).extracting("threadId").containsExactly(active.threadId());
        assertThat(activePage.threads().getFirst().archivedAt()).isNull();
        assertThat(archivedPage.threads()).extracting("threadId").containsExactly(archived.threadId());
        assertThat(archivedPage.threads().getFirst().archivedAt()).isNotNull();
    }

    @Test
    void archiveUnarchiveAndDeleteChatThread() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var archived = service.updateChatThread(new UpdateChatThreadCommand("user-1", thread.threadId(), true));

        assertThat(archived.threadId()).isEqualTo(thread.threadId());
        assertThat(archived.archivedAt()).isNotNull();
        assertThat(service.listChatThreads(new ListChatThreadsQuery("user-1", 10, null)).threads()).isEmpty();
        assertThat(service.listChatThreads(new ListChatThreadsQuery("user-1", 10, null, ChatThreadStatus.ARCHIVED)).threads())
            .extracting("threadId")
            .containsExactly(thread.threadId());

        var unarchived = service.updateChatThread(new UpdateChatThreadCommand("user-1", thread.threadId(), false));

        assertThat(unarchived.archivedAt()).isNull();
        var deleted = service.deleteChatThread(new DeleteChatThreadCommand("user-1", thread.threadId()));

        assertThat(deleted.threadId()).isEqualTo(thread.threadId());
        assertThat(deleted.deletedAt()).isNotNull();
        assertThatThrownBy(() -> service.getChatThread(new GetChatThreadQuery("user-1", thread.threadId())))
            .isInstanceOf(ChatNotFoundException.class);
    }

    @Test
    void archivedThreadRejectsNewMessages() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        service.updateChatThread(new UpdateChatThreadCommand("user-1", thread.threadId(), true));

        assertThatThrownBy(() -> service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of("documentGroupId", "group-1"),
            Map.of(),
            "gpt-test"
        )).collectList().block())
            .isInstanceOf(ChatConflictException.class);
        assertThat(persistencePort.messages).isEmpty();
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

        assertThat(events).hasSize(5);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "delta", "done");
        assertThat(events.get(0).data()).containsEntry("phase", "ROUTING");
        assertThat(events.get(1).data()).containsEntry("route", "NOTE_QA");
        assertThat(events.get(1).data()).containsEntry("routerModel", "gpt-5.4-nano");
        assertThat(events.get(2).eventName()).isEqualTo("delta");
        assertThat(events.get(2).data()).containsEntry("text", "답변 ");
        assertThat(events.get(3).data()).containsEntry("text", "완료");
        assertThat(events.get(4).eventName()).isEqualTo("done");
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
        assertThat(assistantMessage.llmRunId()).isNotBlank();
        assertThat(assistantMessage.route()).isEqualTo(ChatRoute.NOTE_QA);
        assertThat(assistantMessage.savedDraftNoteId()).isNull();

        assertThat(chatEventPort.messageEvents).hasSize(1);
        assertThat(chatEventPort.messageEvents.getFirst().citationNoteIds()).containsExactly("note-1");
        assertThat(tokenUsagePort.records).hasSize(1);
        TokenUsagePort.TokenUsageRecord usage = tokenUsagePort.records.getFirst();
        assertThat(usage.featureId()).isEqualTo("rag-chat");
        assertThat(usage.modelId()).isEqualTo("gpt-test");
        assertThat(usage.causationId()).isEqualTo(assistantMessage.messageId());
        assertThat(usage.inputTokens()).isEqualTo(assistantMessage.tokenUsage().inputTokens());
        assertThat(usage.outputTokens()).isEqualTo(assistantMessage.tokenUsage().outputTokens());

        new LlmFeedbackService(llmOpsStore).submitFeedback(
            "user-1",
            assistantMessage.llmRunId(),
            LlmFeedbackRating.LIKE,
            null,
            null
        );
        var detail = service.getChatThread(new GetChatThreadQuery("user-1", thread.threadId()));
        assertThat(detail.messages().get(0)).containsEntry("feedbackRating", null);
        assertThat(detail.messages().get(1))
            .containsEntry("llmRunId", assistantMessage.llmRunId())
            .containsEntry("route", "NOTE_QA")
            .containsEntry("savedDraftNoteId", null)
            .containsEntry("feedbackRating", "LIKE");
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

        assertThat(events).hasSize(5);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "delta", "done");
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

        assertThat(events).hasSize(4);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "done");
        assertThat(events.get(2).data().get("text")).asString().contains("현재 제공된 노트 내용이 너무 짧아");
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

        assertThat(firstEvent(events, "route").data()).containsEntry("route", "WORKSPACE_SEARCH");
        assertThat(retrievalPort.lastQuery.scope()).isEqualTo(SearchScope.USER);
        assertThat(retrievalPort.lastQuery.documentGroupId()).isNull();
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Keep the directness level: high")
            .doesNotContain("every final generated or edited user-facing text segment");
        assertThat(aiChatPort.lastRequest.messages().getLast().content()).contains("workspace context");
        assertThat(persistencePort.messages.get(1).citations().getFirst().documentGroupId()).isEqualTo("group-2");
    }

    @Test
    void composeAllowsCurrentExternalTopicDraftWithoutRetrievedContext() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.COMPOSE, "write draft", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "최신 홍명보호 월드컵 성적에 대한 문서 작성해줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(firstEvent(events, "route").data()).containsEntry("route", "COMPOSE");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("writing assistant")
            .contains("If web context is provided")
            .contains("Do not invent latest facts beyond the provided web context")
            .contains("level-1 Markdown heading")
            .contains("\"# <title>\"")
            .contains("topic noun phrase of 2 to 8 eojeol")
            .contains("Never repeat the user's question or request as the title")
            .contains("never use a question mark, interrogative word, or interrogative ending")
            .contains("personal note-taking tone")
            .contains("Mandatory user style instructions")
            .contains("every final generated or edited user-facing text segment")
            .contains("Use this formality/tone: business")
            .doesNotContain("every final user-facing conversational sentence");
        assertThat(aiChatPort.lastRequest.messages().getLast().content())
            .contains("Request:")
            .contains("최신 홍명보호 월드컵 성적에 대한 문서 작성해줘");
        assertThat(persistencePort.messages.get(1).route()).isEqualTo(ChatRoute.COMPOSE);
    }

    @Test
    void recordChatDraftNoteStoresNoteIdAndReturnsExistingMapping() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        persistencePort.saveMessage(ChatMessage.assistant(
            "message-2",
            thread.threadId(),
            thread.userId(),
            "# 초안\n\n본문",
            "gpt-test",
            List.of(),
            List.of(),
            null,
            null,
            ChatRoute.COMPOSE,
            Instant.parse("2026-06-23T00:00:02Z")
        ));

        var recorded = service.recordChatDraftNote(new RecordChatDraftNoteCommand(
            "user-1",
            thread.threadId(),
            "message-2",
            "note-1"
        ));
        var repeated = service.recordChatDraftNote(new RecordChatDraftNoteCommand(
            "user-1",
            thread.threadId(),
            "message-2",
            "note-2"
        ));

        assertThat(recorded.noteId()).isEqualTo("note-1");
        assertThat(repeated.noteId()).isEqualTo("note-1");
        assertThat(persistencePort.messages.getFirst().savedDraftNoteId()).isEqualTo("note-1");
    }

    @Test
    void recordChatDraftNoteRejectsNonDraftRoute() {
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        persistencePort.saveMessage(ChatMessage.assistant(
            "message-2",
            thread.threadId(),
            thread.userId(),
            "답변",
            "gpt-test",
            List.of(),
            List.of(),
            null,
            null,
            ChatRoute.NOTE_QA,
            Instant.parse("2026-06-23T00:00:02Z")
        ));

        assertThatThrownBy(() -> service.recordChatDraftNote(new RecordChatDraftNoteCommand(
            "user-1",
            thread.threadId(),
            "message-2",
            "note-1"
        )))
            .isInstanceOf(ChatConflictException.class)
            .hasMessage("Chat message cannot be saved as a draft note.");
    }

    @Test
    void composeWithWebSearchUsesWebContextAndStoresWebSources() {
        routeDecider.decision = new ChatRouteDecision(
            ChatRoute.COMPOSE,
            "write current draft",
            "gpt-5.4-nano",
            true,
            "홍명보호 월드컵 성적 최신"
        );
        externalSearchPort.response = new ExternalSearchResponse(
            "웹 검색 요약",
            List.of(new ExternalSearchSource(
                "월드컵 예선 기사",
                "https://example.com/worldcup",
                "최신 경기 결과 스니펫",
                1
            )),
            "openai",
            "gpt-5.5",
            "resp-1",
            null
        );
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "최신 홍명보호 월드컵 성적에 대한 문서 작성해줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(eventNames(events)).containsExactly(
            "status",
            "route",
            "status",
            "web_sources",
            "status",
            "delta",
            "delta",
            "done"
        );
        assertThat(events.get(2).data())
            .containsEntry("phase", "WEB_SEARCHING")
            .containsEntry("requiresWebSearch", true)
            .containsEntry("webSearchQuery", "홍명보호 월드컵 성적 최신");
        assertThat(firstEvent(events, "web_sources").data())
            .containsEntry("webSearchQuery", "홍명보호 월드컵 성적 최신");
        Object webSources = firstEvent(events, "web_sources").data().get("sources");
        assertThat(webSources).isInstanceOf(List.class);
        assertThat((List<?>) webSources).hasSize(1);
        assertThat(events.get(4).data())
            .containsEntry("phase", "ANSWERING")
            .containsEntry("requiresWebSearch", true);
        assertThat(firstEvent(events, "route").data())
            .containsEntry("route", "COMPOSE")
            .containsEntry("requiresWebSearch", true)
            .containsEntry("webSearchQuery", "홍명보호 월드컵 성적 최신");
        assertThat(externalSearchPort.calls).isEqualTo(1);
        assertThat(externalSearchPort.lastRequest.query()).isEqualTo("홍명보호 월드컵 성적 최신");
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("Web context may be included")
            .contains("writing assistant");
        assertThat(aiChatPort.lastRequest.messages().getLast().content())
            .contains("Web context:")
            .contains("웹 검색 요약")
            .contains("https://example.com/worldcup");
        assertThat(persistencePort.messages.get(1).webSources()).hasSize(1);
        assertThat(persistencePort.messages.get(1).webSources().getFirst().url())
            .isEqualTo("https://example.com/worldcup");
    }

    @Test
    void pureCurrentFactLookupWithWebSearchUsesWebAnswerRoute() {
        routeDecider.decision = new ChatRouteDecision(
            ChatRoute.OUT_OF_SCOPE,
            "current fact lookup",
            "gpt-5.4-nano",
            true,
            "오늘 월드컵 예선 결과"
        );
        externalSearchPort.response = new ExternalSearchResponse(
            "오늘 경기 결과 요약",
            List.of(new ExternalSearchSource("경기 결과", "https://example.com/result", "결과 스니펫", 1)),
            "openai",
            "gpt-5.5",
            "resp-2",
            null
        );
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "오늘 월드컵 예선 결과 알려줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("web answer assistant")
            .doesNotContain("BrainX 본 채팅");
        assertThat(aiChatPort.lastRequest.messages().getLast().content())
            .contains("Web context:")
            .contains("오늘 경기 결과 요약");
    }

    @Test
    void webSearchUnavailableReturnsGuidanceWithoutAnswerAiCall() {
        routeDecider.decision = new ChatRouteDecision(
            ChatRoute.COMPOSE,
            "write current draft",
            "gpt-5.4-nano",
            true,
            "최신 AI 뉴스"
        );
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "최신 AI 뉴스 보고서 써줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(6);
        assertThat(eventNames(events)).containsExactly("status", "route", "status", "route", "delta", "done");
        assertThat(lastEvent(events, "route").data())
            .containsEntry("route", "OUT_OF_SCOPE")
            .containsEntry("requiresWebSearch", true);
        assertThat(lastEvent(events, "route").data()).containsKey("webSearchQuery");
        assertThat(events.get(4).data().get("text")).asString().isNotBlank();
        assertThat(externalSearchPort.calls).isEqualTo(1);
        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages.get(1).content()).isEqualTo(events.get(4).data().get("text"));
    }

    @Test
    void noteActionWithUnavailableWebSearchReturnsNonDraftRoute() {
        routeDecider.decision = new ChatRouteDecision(
            ChatRoute.NOTE_ACTION,
            "note action needs current facts",
            "gpt-5.4-nano",
            true,
            "latest roadmap"
        );
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "latest roadmap 내용을 노트에 추가할 초안 줘",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(events).hasSize(6);
        assertThat(eventNames(events)).containsExactly("status", "route", "status", "route", "delta", "done");
        assertThat(lastEvent(events, "route").data())
            .containsEntry("route", "OUT_OF_SCOPE")
            .containsEntry("requiresWebSearch", true)
            .containsEntry("webSearchQuery", "latest roadmap");
        assertThat(events.get(4).data().get("text")).asString().isNotBlank();
        assertThat(externalSearchPort.calls).isEqualTo(1);
        assertThat(aiChatPort.calls).isZero();
    }

    @Test
    void webSearchRouteStopsBeforeExternalSearchWhenEntitlementDenied() {
        routeDecider.decision = new ChatRouteDecision(
            ChatRoute.COMPOSE,
            "write current draft",
            "gpt-5.4-nano",
            true,
            "latest AI news"
        );
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "QUOTA_EXHAUSTED";
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "latest AI news report",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(eventNames(events)).containsExactly("status", "route", "status", "error");
        assertThat(events.get(3).data()).containsEntry("code", "FORBIDDEN");
        assertThat(events.get(3).data().get("message")).asString().contains("QUOTA_EXHAUSTED");
        assertThat(entitlementPort.calls).isEqualTo(1);
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("RAG_CHAT");
        assertThat(externalSearchPort.calls).isZero();
        assertThat(aiChatPort.calls).isZero();
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

        assertThat(firstEvent(events, "route").data()).containsEntry("route", "NOTE_ACTION");
        assertThat(retrievalPort.lastQuery).isNull();
        assertThat(aiChatPort.calls).isEqualTo(1);
        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("note action draft assistant")
            .contains("Do not claim that anything was saved")
            .contains("level-1 Markdown heading")
            .contains("\"# <title>\"")
            .contains("personal note-taking tone")
            .contains("Mandatory user style instructions")
            .contains("every final generated or edited user-facing text segment")
            .contains("Use this formality/tone: business")
            .doesNotContain("every final user-facing conversational sentence");
    }

    @Test
    void noteQuestionDoesNotForceDraftTitleHeading() {
        routeDecider.decision = new ChatRouteDecision(ChatRoute.NOTE_QA, "note question", "gpt-5.4-nano");
        ChatThread thread = existingThread();
        persistencePort.saveThread(thread);
        retrievalPort.results = List.of(new NoteChunkSearchResult(
            "user-1",
            "group-1",
            "note-1",
            "note-1::0",
            0,
            "RAG note",
            "RAG context",
            0.9d,
            "hash",
            1,
            null,
            null
        ));

        service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(aiChatPort.lastRequest.messages().getFirst().content())
            .contains("RAG chat assistant")
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Keep the directness level: high")
            .doesNotContain("level-1 Markdown heading")
            .doesNotContain("\"# <title>\"")
            .doesNotContain("personal note-taking tone")
            .doesNotContain("every final generated or edited user-facing text segment");
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

        assertThat(events).hasSize(4);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "done");
        assertThat(events.get(1).data()).containsEntry("route", "OUT_OF_SCOPE");
        assertThat(events.get(2).data().get("text")).asString().contains("BrainX 본 채팅");
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

        assertThat(events).hasSize(4);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "done");
        assertThat(events.get(2).data().get("text")).asString().contains("관련 노트 근거");
        assertThat(aiChatPort.calls).isZero();
        assertThat(persistencePort.messages).hasSize(2);
        assertThat(persistencePort.messages.get(1).role()).isEqualTo(ChatRole.ASSISTANT);
        assertThat(chatEventPort.messageEvents).hasSize(1);
        assertThat(tokenUsagePort.records).isEmpty();
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

        var events = service.sendChatMessage(new SendChatMessageCommand(
            "user-1",
            thread.threadId(),
            "RAG란?",
            Map.of(),
            Map.of(),
            "gpt-test"
        )).collectList().block();

        assertThat(eventNames(events)).containsExactly("status", "route", "error");
        assertThat(events.get(2).data()).containsEntry("code", "FORBIDDEN");
        assertThat(events.get(2).data().get("message")).asString().contains("QUOTA_EXHAUSTED");
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

        assertThat(events).hasSize(4);
        assertThat(eventNames(events)).containsExactly("status", "route", "delta", "error");
        assertThat(events.get(2).eventName()).isEqualTo("delta");
        assertThat(events.get(3).data()).containsEntry("code", "STREAM_ERROR");
        assertThat(persistencePort.messages).hasSize(1);
        assertThat(chatEventPort.messageEvents).isEmpty();
        assertThat(tokenUsagePort.records).isEmpty();
    }

    private static ChatThread existingThread() {
        return new ChatThread("thread-1", "user-1", "group-1", "RAG 질문", "gpt-test", null);
    }

    private static List<String> eventNames(List<ChatStreamEvent> events) {
        return events.stream().map(ChatStreamEvent::eventName).toList();
    }

    private static ChatStreamEvent firstEvent(List<ChatStreamEvent> events, String eventName) {
        return events.stream()
            .filter(event -> event.eventName().equals(eventName))
            .findFirst()
            .orElseThrow();
    }

    private static ChatStreamEvent lastEvent(List<ChatStreamEvent> events, String eventName) {
        return events.stream()
            .filter(event -> event.eventName().equals(eventName))
            .reduce((previous, current) -> current)
            .orElseThrow();
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
                .filter(thread -> thread.userId().equals(userId)
                    && thread.threadId().equals(threadId)
                    && !thread.deleted())
                .findFirst();
        }

        @Override
        public List<ChatThreadSummary> findThreadSummariesByUserId(
            String userId,
            ChatThreadStatus status,
            ChatThreadSummaryCursor cursor,
            int limit
        ) {
            return threads.stream()
                .filter(thread -> thread.userId().equals(userId) && !thread.deleted())
                .filter(thread -> status == ChatThreadStatus.ARCHIVED ? thread.archived() : !thread.archived())
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
        public Optional<ChatThread> archiveThread(String userId, String threadId, Instant archivedAt) {
            return replaceThread(userId, threadId, thread -> new ChatThread(
                thread.threadId(),
                thread.userId(),
                thread.documentGroupId(),
                thread.title(),
                thread.modelId(),
                thread.createdAt(),
                archivedAt,
                thread.deletedAt()
            ));
        }

        @Override
        public Optional<ChatThread> unarchiveThread(String userId, String threadId) {
            return replaceThread(userId, threadId, thread -> new ChatThread(
                thread.threadId(),
                thread.userId(),
                thread.documentGroupId(),
                thread.title(),
                thread.modelId(),
                thread.createdAt(),
                null,
                thread.deletedAt()
            ));
        }

        @Override
        public Optional<ChatThread> deleteThread(String userId, String threadId, Instant deletedAt) {
            return replaceThread(userId, threadId, thread -> new ChatThread(
                thread.threadId(),
                thread.userId(),
                thread.documentGroupId(),
                thread.title(),
                thread.modelId(),
                thread.createdAt(),
                thread.archivedAt(),
                deletedAt
            ));
        }

        @Override
        public ChatMessage saveMessage(ChatMessage message) {
            messages.add(message);
            return message;
        }

        @Override
        public Optional<ChatMessage> findMessageByUserIdAndThreadIdAndMessageId(
            String userId,
            String threadId,
            String messageId
        ) {
            return messages.stream()
                .filter(message -> message.userId().equals(userId)
                    && message.threadId().equals(threadId)
                    && message.messageId().equals(messageId))
                .findFirst();
        }

        @Override
        public Optional<ChatMessage> recordSavedDraftNoteId(
            String userId,
            String threadId,
            String messageId,
            String noteId
        ) {
            for (int index = 0; index < messages.size(); index++) {
                ChatMessage message = messages.get(index);
                if (message.userId().equals(userId)
                    && message.threadId().equals(threadId)
                    && message.messageId().equals(messageId)) {
                    if (message.savedDraftNoteId() != null && !message.savedDraftNoteId().isBlank()) {
                        return Optional.of(message);
                    }
                    ChatMessage updated = new ChatMessage(
                        message.messageId(),
                        message.threadId(),
                        message.userId(),
                        message.role(),
                        message.content(),
                        message.modelId(),
                        message.noteScope(),
                        message.clientContext(),
                        message.citations(),
                        message.webSources(),
                        message.tokenUsage(),
                        message.llmRunId(),
                        message.route(),
                        noteId,
                        message.createdAt()
                    );
                    messages.set(index, updated);
                    return Optional.of(updated);
                }
            }
            return Optional.empty();
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
                thread.archivedAt(),
                thread.deletedAt(),
                lastMessage == null ? threadCreatedAt : lastMessage.createdAt(),
                lastMessage == null ? null : lastMessage.content(),
                threadMessages.size()
            );
        }

        private Optional<ChatThread> replaceThread(
            String userId,
            String threadId,
            java.util.function.Function<ChatThread, ChatThread> mapper
        ) {
            for (int index = 0; index < threads.size(); index++) {
                ChatThread thread = threads.get(index);
                if (thread.userId().equals(userId) && thread.threadId().equals(threadId) && !thread.deleted()) {
                    ChatThread next = mapper.apply(thread);
                    threads.set(index, next);
                    return Optional.of(next);
                }
            }
            return Optional.empty();
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
        private int calls;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            calls++;
            lastRequest = request;
            return new EntitlementDecision(allowed, reasonCode, allowed ? 1000 : 0);
        }
    }

    private static final class FakeExternalSearchPort implements ExternalSearchPort {

        private int calls;
        private ExternalSearchRequest lastRequest;
        private ExternalSearchResponse response;
        private RuntimeException failure;

        @Override
        public ExternalSearchResponse search(ExternalSearchRequest request) {
            calls++;
            lastRequest = request;
            if (failure != null) {
                throw failure;
            }
            if (response != null) {
                return response;
            }
            return new ExternalSearchResponse("", List.of(), "none", request.modelId(), null, null);
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private int calls;
        private int generateCalls;
        private AiChatRequest lastRequest;
        private AiChatRequest lastGenerateRequest;
        private AiChatResponse generateResponse = new AiChatResponse("", null);
        private RuntimeException generateException;
        private Flux<AiChatChunk> chunks = Flux.empty();

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            generateCalls++;
            lastGenerateRequest = request;
            if (generateException != null) {
                throw generateException;
            }
            return generateResponse;
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
