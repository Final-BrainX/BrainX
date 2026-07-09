package com.brainx.intelligence.chat.application.usecase;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.ChatThreadResult;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.CreateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.ChatThreadDetailResult;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.GetChatThreadQuery;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.ThreadView;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListItem;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListPagination;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListResult;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ListChatThreadsQuery;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase.ChatDraftNoteResult;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase.RecordChatDraftNoteCommand;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.ChatThreadDeleteResult;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.ChatThreadUpdateResult;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.DeleteChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.UpdateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort.ChatMessageCreatedEvent;
import com.brainx.intelligence.chat.application.port.outbound.ChatEventPort.ChatThreadCreatedEvent;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort;
import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort.ChatThreadSummaryCursor;
import com.brainx.intelligence.chat.domain.ChatCitation;
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
import com.brainx.intelligence.chat.domain.ChatTokenUsage;
import com.brainx.intelligence.chat.domain.ChatWebSource;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.exception.CapabilityForbiddenException;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiExecutionMetadata;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.LlmFeedbackService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class ChatService implements
    CreateChatThreadUseCase,
    ListChatThreadsUseCase,
    SendChatMessageUseCase,
    GetChatThreadUseCase,
    UpdateChatThreadUseCase,
    RecordChatDraftNoteUseCase {

    static final String RAG_CHAT_CAPABILITY = "RAG_CHAT";
    static final String RAG_CHAT_FEATURE_ID = "rag-chat";
    private static final String NO_CONTEXT_ANSWER = "관련 노트 근거를 찾지 못했습니다.";
    private static final String OUT_OF_SCOPE_ANSWER = "BrainX 본 채팅은 내 노트 검색, 노트 기반 질문, 글 작성, 노트 적용 초안만 처리합니다.";
    private static final String WEB_SEARCH_UNAVAILABLE_ANSWER =
        "현재 웹 검색을 사용할 수 없어 최신 정보를 확인할 수 없습니다. 검색이 필요한 요청은 나중에 다시 시도해 주세요.";
    private static final String INSUFFICIENT_CONTEXT_ANSWER =
        "현재 제공된 노트 내용이 너무 짧아 이 요청을 처리할 수 없습니다. 답변에 필요한 본문이나 선택 영역을 더 제공해 주세요.";
    private static final String STREAM_PHASE_ROUTING = "ROUTING";
    private static final String STREAM_PHASE_WEB_SEARCHING = "WEB_SEARCHING";
    private static final String STREAM_PHASE_ANSWERING = "ANSWERING";
    private static final String STREAM_STATUS_ROUTING = "Routing chat request.";
    private static final String STREAM_STATUS_WEB_SEARCHING = "Searching the web.";
    private static final String STREAM_STATUS_ANSWERING = "Generating an answer.";
    private static final String DRAFT_NOTE_FORMAT_INSTRUCTION = """
        Format draft responses as Markdown for a personal Workspace note.
        The first line must be a level-1 Markdown heading in the exact form "# <title>".
        Write the title as a concise Korean topic noun phrase of 2 to 8 eojeol.
        Never repeat the user's question or request as the title, and never use a question mark, interrogative word, or interrogative ending.
        Add one blank line after the title, then write the body.
        Write the body in a personal note-taking tone ready to save as the user's own note, not an explanatory assistant answer.
        """;
    private static final int HISTORY_LIMIT = 8;
    private static final int CONTEXT_SNIPPET_LENGTH = 1_200;
    private static final int MIN_CLIENT_CONTEXT_CHARS = 80;
    private static final int DEFAULT_THREAD_LIST_LIMIT = 20;
    private static final int MAX_THREAD_LIST_LIMIT = 50;
    private static final int THREAD_PREVIEW_LENGTH = 160;
    private static final int WEB_SEARCH_PREFLIGHT_TOKEN_BUFFER = 1_500;

    private final ChatProperties properties;
    private final ChatThreadTitleGenerator titleGenerator;
    private final ChatRouteDecider chatRouteDecider;
    private final ChatPersistencePort chatPersistencePort;
    private final NoteChunkRetrievalPort noteChunkRetrievalPort;
    private final ChatEntitlementGuard entitlementGuard;
    private final ChatWebSearchResolver webSearchResolver;
    private final AiChatPort aiChatPort;
    private final AiTokenUsageCostEstimator usageCostEstimator;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final LlmFeedbackService llmFeedbackService;
    private final PromptRegistryService promptRegistryService;
    private final ChatEventPort chatEventPort;
    private final StylePromptCompiler stylePromptCompiler;

    public ChatService(
        ChatProperties properties,
        ChatThreadTitleGenerator titleGenerator,
        ChatRouteDecider chatRouteDecider,
        ChatPersistencePort chatPersistencePort,
        NoteChunkRetrievalPort noteChunkRetrievalPort,
        EntitlementPort entitlementPort,
        ExternalSearchPort externalSearchPort,
        AiChatPort aiChatPort,
        AiTokenUsageCostEstimator usageCostEstimator,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        LlmFeedbackService llmFeedbackService,
        PromptRegistryService promptRegistryService,
        ChatEventPort chatEventPort,
        StylePromptCompiler stylePromptCompiler
    ) {
        this.properties = properties;
        this.titleGenerator = titleGenerator;
        this.chatRouteDecider = chatRouteDecider;
        this.chatPersistencePort = chatPersistencePort;
        this.noteChunkRetrievalPort = noteChunkRetrievalPort;
        this.entitlementGuard = new ChatEntitlementGuard(entitlementPort);
        this.webSearchResolver = new ChatWebSearchResolver(externalSearchPort);
        this.aiChatPort = aiChatPort;
        this.usageCostEstimator = usageCostEstimator;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.llmFeedbackService = llmFeedbackService;
        this.promptRegistryService = promptRegistryService;
        this.chatEventPort = chatEventPort;
        this.stylePromptCompiler = stylePromptCompiler;
    }

    @Override
    public ChatThreadResult createChatThread(CreateChatThreadCommand command) {
        String userId = requireText(command.userId(), "userId");
        String fallbackTitle = requireText(command.title(), "title");
        String modelId = requireText(command.modelId(), "modelId");
        String documentGroupId = DocumentGroups.normalize(command.documentGroupId());
        String title = titleGenerator.titleFor(userId, command.initialMessage(), fallbackTitle);
        ChatThread thread = chatPersistencePort.saveThread(new ChatThread(
            UUID.randomUUID().toString(),
            userId,
            documentGroupId,
            title,
            modelId,
            Instant.now()
        ));
        chatEventPort.chatThreadCreated(new ChatThreadCreatedEvent(
            thread.userId(),
            thread.threadId(),
            thread.documentGroupId(),
            thread.modelId(),
            thread.title()
        ));
        return toThreadResult(thread);
    }

    @Override
    public ChatThreadListResult listChatThreads(ListChatThreadsQuery query) {
        String userId = requireText(query.userId(), "userId");
        int limit = normalizeThreadListLimit(query.limit());
        ChatThreadStatus status = query.status() == null ? ChatThreadStatus.ACTIVE : query.status();
        ChatThreadSummaryCursor cursor = decodeThreadListCursor(query.cursor());
        List<ChatThreadSummary> summaries = chatPersistencePort.findThreadSummariesByUserId(
            userId,
            status,
            cursor,
            limit + 1
        );
        boolean hasMore = summaries.size() > limit;
        List<ChatThreadSummary> visibleSummaries = summaries.stream()
            .limit(limit)
            .toList();
        String nextCursor = hasMore && !visibleSummaries.isEmpty()
            ? encodeThreadListCursor(visibleSummaries.getLast())
            : null;
        return new ChatThreadListResult(
            visibleSummaries.stream().map(ChatService::toThreadListItem).toList(),
            new ChatThreadListPagination(limit, nextCursor, hasMore)
        );
    }

    @Override
    public Flux<ChatStreamEvent> sendChatMessage(SendChatMessageCommand command) {
        String userId = requireText(command.userId(), "userId");
        String threadId = requireText(command.threadId(), "threadId");
        String message = requireText(command.message(), "message");
        String modelId = requireText(command.modelId(), "modelId");
        ChatThread thread = chatPersistencePort.findThreadByUserIdAndThreadId(userId, threadId)
            .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId));
        if (thread.archived()) {
            throw new ChatConflictException("Archived chat thread cannot accept new messages.");
        }
        validateNoteScope(thread, command.noteScope());
        Map<String, Object> noteScope = command.noteScope() == null ? Map.of() : command.noteScope();

        ChatMessage userMessage = chatPersistencePort.saveMessage(ChatMessage.user(
            UUID.randomUUID().toString(),
            thread.threadId(),
            userId,
            message,
            modelId,
            noteScope,
            command.clientContext(),
            Instant.now()
        ));
        List<ChatMessage> history = chatPersistencePort.findMessagesByUserIdAndThreadId(userId, threadId).stream()
            .filter(messageItem -> !messageItem.messageId().equals(userMessage.messageId()))
            .toList();
        String clientContextPrompt = clientContextPrompt(command.clientContext());
        boolean hasClientContext = StringUtils.hasText(clientContextPrompt);

        return Flux.concat(
            Flux.just(ChatStreamEvent.status(STREAM_PHASE_ROUTING, STREAM_STATUS_ROUTING, false, null)),
            Flux.defer(() -> routedMessageStream(
                command,
                userId,
                message,
                modelId,
                thread,
                userMessage,
                history,
                clientContextPrompt,
                hasClientContext,
                noteScope
            ))
        ).onErrorResume(exception -> Flux.just(ChatStreamEvent.error(streamErrorCode(exception), safeMessage(exception))));
    }

    private Flux<ChatStreamEvent> routedMessageStream(
        SendChatMessageCommand command,
        String userId,
        String message,
        String modelId,
        ChatThread thread,
        ChatMessage userMessage,
        List<ChatMessage> history,
        String clientContextPrompt,
        boolean hasClientContext,
        Map<String, Object> noteScope
    ) {
        ChatRouteDecision routeDecision = chatRouteDecider.decide(new ChatRouteDecider.ChatRouteRequest(
            userId,
            message,
            thread.documentGroupId(),
            noteScope,
            command.clientContext()
        ));
        ChatRoute route = routeDecision.route();
        if (route == ChatRoute.OUT_OF_SCOPE && !routeDecision.requiresWebSearch()) {
            return Flux.concat(Flux.just(routeEvent(routeDecision)), fixedAnswerStream(thread, userMessage, modelId, OUT_OF_SCOPE_ANSWER, route));
        }
        if (requiresNoteContext(route)
            && hasClientContext
            && isRightSidebarContext(command.clientContext())
            && clientContextContentLength(command.clientContext()) < MIN_CLIENT_CONTEXT_CHARS) {
            return Flux.concat(Flux.just(routeEvent(routeDecision)), fixedAnswerStream(thread, userMessage, modelId, INSUFFICIENT_CONTEXT_ANSWER, route));
        }
        return Flux.concat(
            Flux.just(routeEvent(routeDecision)),
            routeDecision.requiresWebSearch()
                ? Flux.just(ChatStreamEvent.status(
                    STREAM_PHASE_WEB_SEARCHING,
                    STREAM_STATUS_WEB_SEARCHING,
                    true,
                    routeDecision.webSearchQuery()
                ))
                : Flux.empty(),
            Flux.defer(() -> messageStreamAfterRoute(
                userId,
                message,
                modelId,
                thread,
                userMessage,
                history,
                clientContextPrompt,
                hasClientContext,
                routeDecision,
                route,
                command.clientContext()
            ))
        );
    }

    private Flux<ChatStreamEvent> messageStreamAfterRoute(
        String userId,
        String message,
        String modelId,
        ChatThread thread,
        ChatMessage userMessage,
        List<ChatMessage> history,
        String clientContextPrompt,
        boolean hasClientContext,
        ChatRouteDecision routeDecision,
        ChatRoute route,
        Map<String, Object> clientContext
    ) {
        entitlementGuard.checkRagChat(userId, preflightTokenEstimate(
            userId,
            message,
            history,
            clientContextPrompt,
            clientContext,
            routeDecision,
            route
        ));
        if (routeDecision.requiresWebSearch()) {
            return webSearchStreamThenAnswer(
                userId,
                message,
                modelId,
                thread,
                userMessage,
                history,
                clientContextPrompt,
                hasClientContext,
                routeDecision,
                route,
                clientContext
            );
        }

        return answerAfterWebSearch(
            userId,
            message,
            modelId,
            thread,
            userMessage,
            history,
            clientContextPrompt,
            hasClientContext,
            routeDecision,
            route,
            clientContext,
            WebSearchContext.none()
        );
    }

    private Flux<ChatStreamEvent> webSearchStreamThenAnswer(
        String userId,
        String message,
        String modelId,
        ChatThread thread,
        ChatMessage userMessage,
        List<ChatMessage> history,
        String clientContextPrompt,
        boolean hasClientContext,
        ChatRouteDecision routeDecision,
        ChatRoute route,
        Map<String, Object> clientContext
    ) {
        AtomicReference<WebSearchContext> context = new AtomicReference<>(WebSearchContext.unavailable(routeDecision.webSearchQuery()));
        Flux<ChatStreamEvent> searchEvents = webSearchResolver.resolveStream(userId, message, routeDecision)
            .handle((resolution, sink) -> {
                if (resolution.completed()) {
                    context.set(resolution.context());
                } else if (resolution.event() != null) {
                    sink.next(resolution.event());
                }
            });
        return Flux.concat(
            searchEvents,
            Flux.defer(() -> answerAfterWebSearch(
                userId,
                message,
                modelId,
                thread,
                userMessage,
                history,
                clientContextPrompt,
                hasClientContext,
                routeDecision,
                route,
                clientContext,
                context.get()
            ))
        );
    }

    private Flux<ChatStreamEvent> answerAfterWebSearch(
        String userId,
        String message,
        String modelId,
        ChatThread thread,
        ChatMessage userMessage,
        List<ChatMessage> history,
        String clientContextPrompt,
        boolean hasClientContext,
        ChatRouteDecision routeDecision,
        ChatRoute route,
        Map<String, Object> clientContext,
        WebSearchContext webSearch
    ) {
        if (routeDecision.requiresWebSearch() && !webSearch.available()) {
            return Flux.concat(
                Flux.just(routeEvent(unavailableWebSearchRouteDecision(routeDecision))),
                fixedAnswerStream(thread, userMessage, modelId, WEB_SEARCH_UNAVAILABLE_ANSWER, ChatRoute.OUT_OF_SCOPE)
            );
        }

        List<RagContext> contexts = hasClientContext || !requiresNoteContext(route)
            ? List.of()
            : retrieveContexts(thread, message, route);
        boolean noteScopedSidebar = isRightSidebarContext(clientContext);
        PromptResolution promptResolution = promptRegistryService.resolve(promptKey(route, webSearch), systemPrompt(route, webSearch));
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                promptResolution.content(),
                noteScopedSidebarInstructions(noteScopedSidebar)
            ),
            styleInstructions(userId, route)
        );
        String userPrompt = hasClientContext
            ? userPromptFromClientContext(message, clientContextPrompt, route, webSearch)
            : userPrompt(message, contexts, route, webSearch);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + historyPrompt(history) + "\n" + userPrompt);
        entitlementGuard.checkRagChat(userId, tokenEstimate);

        if (requiresNoteContext(route) && !hasClientContext && contexts.isEmpty() && !webSearch.available()) {
            return fixedAnswerStream(thread, userMessage, modelId, NO_CONTEXT_ANSWER, route);
        }
        Flux<ChatStreamEvent> answerStream = aiStream(
            thread,
            userMessage,
            modelId,
            systemPrompt,
            promptResolution.promptKey(),
            promptResolution.version(),
            route,
            history,
            userPrompt,
            contexts,
            webSearch
        );
        if (!routeDecision.requiresWebSearch()) {
            return answerStream;
        }
        return Flux.concat(
            Flux.just(ChatStreamEvent.status(
                STREAM_PHASE_ANSWERING,
                STREAM_STATUS_ANSWERING,
                true,
                routeDecision.webSearchQuery()
            )),
            answerStream
        );
    }

    private int preflightTokenEstimate(
        String userId,
        String message,
        List<ChatMessage> history,
        String clientContextPrompt,
        Map<String, Object> clientContext,
        ChatRouteDecision routeDecision,
        ChatRoute route
    ) {
        WebSearchContext noWebSearch = WebSearchContext.none();
        boolean hasClientContext = StringUtils.hasText(clientContextPrompt);
        boolean noteScopedSidebar = isRightSidebarContext(clientContext);
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                systemPrompt(route, noWebSearch),
                noteScopedSidebarInstructions(noteScopedSidebar)
            ),
            styleInstructions(userId, route)
        );
        String userPrompt = hasClientContext
            ? userPromptFromClientContext(message, clientContextPrompt, route, noWebSearch)
            : userPrompt(message, List.of(), route, noWebSearch);
        int estimate = estimateTokens(systemPrompt + "\n" + historyPrompt(history) + "\n" + userPrompt);
        return routeDecision.requiresWebSearch() ? estimate + WEB_SEARCH_PREFLIGHT_TOKEN_BUFFER : estimate;
    }

    @Override
    public ChatThreadDetailResult getChatThread(GetChatThreadQuery query) {
        String userId = requireText(query.userId(), "userId");
        String threadId = requireText(query.threadId(), "threadId");
        ChatThread thread = chatPersistencePort.findThreadByUserIdAndThreadId(userId, threadId)
            .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId));
        List<ChatMessage> domainMessages = chatPersistencePort.findMessagesByUserIdAndThreadId(userId, threadId);
        Map<String, LlmFeedbackRating> feedbackRatings = llmFeedbackService.feedbackRatingsByRunId(
            userId,
            domainMessages.stream()
                .map(ChatMessage::llmRunId)
                .toList()
        );
        List<Map<String, Object>> messages = domainMessages.stream()
            .map(message -> messageMap(message, feedbackRatings.get(message.llmRunId())))
            .toList();
        return new ChatThreadDetailResult(toThreadView(thread), messages);
    }

    @Override
    public ChatThreadUpdateResult updateChatThread(UpdateChatThreadCommand command) {
        String userId = requireText(command.userId(), "userId");
        String threadId = requireText(command.threadId(), "threadId");
        ChatThread thread = command.archived()
            ? chatPersistencePort.archiveThread(userId, threadId, Instant.now())
                .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId))
            : chatPersistencePort.unarchiveThread(userId, threadId)
                .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId));
        return toThreadUpdateResult(thread);
    }

    @Override
    public ChatThreadDeleteResult deleteChatThread(DeleteChatThreadCommand command) {
        String userId = requireText(command.userId(), "userId");
        String threadId = requireText(command.threadId(), "threadId");
        ChatThread thread = chatPersistencePort.deleteThread(userId, threadId, Instant.now())
            .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId));
        return new ChatThreadDeleteResult(thread.threadId(), thread.deletedAt());
    }

    @Override
    public ChatDraftNoteResult recordChatDraftNote(RecordChatDraftNoteCommand command) {
        String userId = requireText(command.userId(), "userId");
        String threadId = requireText(command.threadId(), "threadId");
        String messageId = requireText(command.messageId(), "messageId");
        String noteId = requireText(command.noteId(), "noteId");
        chatPersistencePort.findThreadByUserIdAndThreadId(userId, threadId)
            .orElseThrow(() -> new ChatNotFoundException("Chat thread not found: " + threadId));
        ChatMessage message = chatPersistencePort.findMessageByUserIdAndThreadIdAndMessageId(
                userId,
                threadId,
                messageId
            )
            .orElseThrow(() -> new ChatNotFoundException("Chat message not found: " + messageId));
        if (message.role() != ChatRole.ASSISTANT || !isDraftSaveRoute(message.route())) {
            throw new ChatConflictException("Chat message cannot be saved as a draft note.");
        }
        if (StringUtils.hasText(message.savedDraftNoteId())) {
            return new ChatDraftNoteResult(threadId, messageId, message.savedDraftNoteId());
        }
        ChatMessage updated = chatPersistencePort.recordSavedDraftNoteId(userId, threadId, messageId, noteId)
            .orElseThrow(() -> new ChatNotFoundException("Chat message not found: " + messageId));
        return new ChatDraftNoteResult(threadId, messageId, updated.savedDraftNoteId());
    }

    private Flux<ChatStreamEvent> fixedAnswerStream(
        ChatThread thread,
        ChatMessage userMessage,
        String modelId,
        String answer,
        ChatRoute route
    ) {
        String assistantMessageId = UUID.randomUUID().toString();
        ChatTokenUsage tokenUsage = estimatedUsage(modelId, userMessage.content(), answer);
        ChatMessage assistantMessage = saveAssistantMessage(
            thread,
            assistantMessageId,
            answer,
            modelId,
            List.of(),
            tokenUsage,
            route
        );
        publishMessageSideEffects(thread, assistantMessage, tokenUsage);
        return Flux.just(ChatStreamEvent.delta(answer), ChatStreamEvent.done(assistantMessageId));
    }

    private static ChatStreamEvent routeEvent(ChatRouteDecision routeDecision) {
        return ChatStreamEvent.route(
            routeDecision.route().name(),
            routeDecision.reason(),
            routeDecision.routerModel(),
            routeDecision.requiresWebSearch(),
            routeDecision.webSearchQuery()
        );
    }

    private static ChatRouteDecision unavailableWebSearchRouteDecision(ChatRouteDecision routeDecision) {
        return new ChatRouteDecision(
            ChatRoute.OUT_OF_SCOPE,
            routeDecision.reason(),
            routeDecision.routerModel(),
            true,
            routeDecision.webSearchQuery()
        );
    }

    private Flux<ChatStreamEvent> aiStream(
        ChatThread thread,
        ChatMessage userMessage,
        String modelId,
        String systemPrompt,
        String promptKey,
        String promptVersion,
        ChatRoute route,
        List<ChatMessage> history,
        String userPrompt,
        List<RagContext> contexts,
        WebSearchContext webSearch
    ) {
        String assistantMessageId = UUID.randomUUID().toString();
        StringBuilder answer = new StringBuilder();
        List<AiChatMessage> promptMessages = promptMessages(systemPrompt, history, userPrompt);
        Map<String, Object> metadata = runMetadata(thread.threadId(), route, webSearch);
        AiRunRecorder.RunHandle runHandle = aiRunRecorder.startChatRun(
            thread.userId(),
            RAG_CHAT_FEATURE_ID,
            promptKey,
            promptVersion,
            modelId,
            "CHAT_MESSAGE",
            assistantMessageId,
            promptMessages,
            metadata
        );

        return aiChatPort.stream(new AiChatRequest(
                modelId,
                promptMessages,
                new AiExecutionMetadata(
                    thread.userId(),
                    RAG_CHAT_FEATURE_ID,
                    promptKey,
                    promptVersion,
                    "CHAT_MESSAGE",
                    assistantMessageId,
                    metadata
                )
            ))
            .filter(chunk -> !chunk.done())
            .map(chunk -> {
                String delta = chunk.delta() == null ? "" : chunk.delta();
                answer.append(delta);
                return ChatStreamEvent.delta(delta);
            })
            .concatWith(Mono.fromSupplier(() -> {
                ChatTokenUsage tokenUsage = estimatedUsage(
                    modelId,
                    systemPrompt + "\n" + historyPrompt(history) + "\n" + userPrompt,
                    answer.toString()
                );
                ChatMessage assistantMessage = saveAssistantMessage(
                    thread,
                    assistantMessageId,
                    answer.toString(),
                    modelId,
                    contexts.stream().map(RagContext::citation).toList(),
                    webSearch.sources(),
                    tokenUsage,
                    runHandle.llmRunId(),
                    route
                );
                publishMessageSideEffects(thread, assistantMessage, tokenUsage);
                recordAiStreamUsage(thread.userId(), assistantMessage, tokenUsage);
                aiRunRecorder.complete(runHandle, modelId, answer.toString(), toAiTokenUsage(tokenUsage));
                return ChatStreamEvent.done(assistantMessageId, runHandle.llmRunId());
            }))
            .onErrorResume(exception -> {
                aiRunRecorder.fail(runHandle, exception instanceof Exception checked ? checked : new IllegalStateException(exception));
                return Flux.just(ChatStreamEvent.error("STREAM_ERROR", safeMessage(exception)));
            });
    }

    private ChatMessage saveAssistantMessage(
        ChatThread thread,
        String assistantMessageId,
        String answer,
        String modelId,
        List<ChatCitation> citations,
        ChatTokenUsage tokenUsage,
        ChatRoute route
    ) {
        return saveAssistantMessage(thread, assistantMessageId, answer, modelId, citations, tokenUsage, null, route);
    }

    private ChatMessage saveAssistantMessage(
        ChatThread thread,
        String assistantMessageId,
        String answer,
        String modelId,
        List<ChatCitation> citations,
        ChatTokenUsage tokenUsage,
        String llmRunId,
        ChatRoute route
    ) {
        return saveAssistantMessage(thread, assistantMessageId, answer, modelId, citations, List.of(), tokenUsage, llmRunId, route);
    }

    private ChatMessage saveAssistantMessage(
        ChatThread thread,
        String assistantMessageId,
        String answer,
        String modelId,
        List<ChatCitation> citations,
        List<ChatWebSource> webSources,
        ChatTokenUsage tokenUsage,
        String llmRunId,
        ChatRoute route
    ) {
        return chatPersistencePort.saveMessage(ChatMessage.assistant(
            assistantMessageId,
            thread.threadId(),
            thread.userId(),
            StringUtils.hasText(answer) ? answer : "(empty)",
            modelId,
            citations,
            webSources,
            tokenUsage,
            llmRunId,
            route,
            Instant.now()
        ));
    }

    private void publishMessageSideEffects(ChatThread thread, ChatMessage assistantMessage, ChatTokenUsage tokenUsage) {
        chatEventPort.chatMessageCreated(new ChatMessageCreatedEvent(
            thread.userId(),
            thread.threadId(),
            assistantMessage.messageId(),
            thread.documentGroupId(),
            assistantMessage.modelId(),
            tokenUsage.inputTokens(),
            tokenUsage.outputTokens(),
            assistantMessage.citations().stream()
                .map(ChatCitation::noteId)
                .distinct()
                .toList()
        ));
    }

    private void recordAiStreamUsage(String userId, ChatMessage assistantMessage, ChatTokenUsage tokenUsage) {
        aiUsageRecorder.recordRawUsage(
            userId,
            RAG_CHAT_FEATURE_ID,
            assistantMessage.modelId(),
            assistantMessage.messageId(),
            tokenUsage.inputTokens(),
            tokenUsage.cachedInputTokens(),
            tokenUsage.outputTokens(),
            tokenUsage.reasoningTokens(),
            tokenUsage.totalTokens()
        );
    }

    private List<RagContext> retrieveContexts(ChatThread thread, String message, ChatRoute route) {
        SearchScope scope = route == ChatRoute.WORKSPACE_SEARCH ? SearchScope.USER : SearchScope.DOCUMENT_GROUP;
        return noteChunkRetrievalPort.searchChunks(new NoteChunkSearchQuery(
                thread.userId(),
                scope,
                scope == SearchScope.USER ? null : thread.documentGroupId(),
                message,
                retrievalTopK()
            )).stream()
            .filter(result -> result.score() >= properties.getMinScore())
            .sorted(Comparator.comparingDouble(NoteChunkSearchResult::score).reversed())
            .map(ChatService::toContext)
            .filter(new PerNoteChunkLimit(properties.getMaxChunksPerNote())::allow)
            .limit(contextLimit())
            .toList();
    }

    private static RagContext toContext(NoteChunkSearchResult result) {
        return new RagContext(
            new ChatCitation(
                result.noteId(),
                result.documentGroupId(),
                result.chunkId(),
                result.chunkIndex(),
                result.title(),
                result.sourcePath(),
                result.sourceFilename(),
                result.score()
            ),
            snippet(result.text())
        );
    }

    private static String snippet(String text) {
        if (text == null || text.length() <= CONTEXT_SNIPPET_LENGTH) {
            return text == null ? "" : text;
        }
        return text.substring(0, CONTEXT_SNIPPET_LENGTH).trim();
    }

    private static String systemPrompt(ChatRoute route, WebSearchContext webSearch) {
        String prompt = switch (route) {
            case NOTE_QA, WORKSPACE_SEARCH -> """
                You are BrainX RAG chat assistant.
                Answer in Korean using only the provided note context, web context, and recent chat history.
                Treat note context and web context as separate evidence sources.
                Use web context only for current or external facts. Do not claim web facts came from user notes.
                If the context does not contain enough evidence, say that you do not know.
                Keep the answer concise and mention the cited note titles naturally when useful.
                """;
            case COMPOSE -> """
                You are BrainX writing assistant.
                Write the requested draft in Korean unless the user asks for another language.
                If note context is provided, use it as reference. If web context is provided, use it as the factual basis for current or external facts.
                Do not invent latest facts beyond the provided web context.
                If no context is provided, write a general draft without pretending it came from notes or live verification.
                Return only the requested content unless a short note is necessary.
                """ + DRAFT_NOTE_FORMAT_INSTRUCTION;
            case NOTE_ACTION -> """
                You are BrainX note action draft assistant.
                Produce Markdown content that the user can save, insert, append, or apply to a note.
                Do not claim that anything was saved, inserted, appended, or applied.
                Return the applicable draft content only.
                """ + DRAFT_NOTE_FORMAT_INSTRUCTION;
            case OUT_OF_SCOPE -> webSearch.available() ? """
                You are BrainX web answer assistant.
                Answer in Korean using only the provided web context and recent chat history.
                Do not use unstated current facts. If the web context is insufficient, say so briefly.
                Keep the answer concise and mention source titles naturally when useful.
                """ : "";
        };
        if (!webSearch.available() || route == ChatRoute.OUT_OF_SCOPE) {
            return prompt;
        }
        return prompt + """

            Web context may be included below. When it is present, separate note-based claims from web-based current facts.
            """;
    }

    private static String noteScopedSidebarInstructions(boolean noteScopedSidebar) {
        if (!noteScopedSidebar) {
            return "";
        }
        return """
            This request comes from the note sidebar, so it is note-scoped.
            First decide whether the user's question is about the current note, selected text, or an operation on that note context.
            If the question is unrelated to the provided note context, do not answer the external question.
            Instead, briefly say in Korean that this sidebar answers questions about the current note.
            """;
    }

    private String styleInstructions(String userId, ChatRoute route) {
        return switch (route) {
            case NOTE_QA, WORKSPACE_SEARCH -> stylePromptCompiler.conversationToneInstructions(userId);
            case COMPOSE, NOTE_ACTION -> stylePromptCompiler.writingStyleInstructions(userId);
            case OUT_OF_SCOPE -> "";
        };
    }

    private String userPrompt(String message, List<RagContext> contexts, ChatRoute route, WebSearchContext webSearch) {
        StringBuilder builder = new StringBuilder();
        builder.append(route == ChatRoute.COMPOSE || route == ChatRoute.NOTE_ACTION ? "Request:\n" : "Question:\n")
            .append(message)
            .append("\n\nNote context:\n");
        int remainingChars = properties.getMaxContextChars();
        for (int index = 0; index < contexts.size() && remainingChars > 0; index++) {
            RagContext context = contexts.get(index);
            ChatCitation citation = context.citation();
            String header = "[" + (index + 1) + "] title=" + citation.title()
                + ", noteId=" + citation.noteId()
                + ", chunkIndex=" + citation.chunkIndex()
                + sourceLabel(citation)
                + ", score=" + citation.score()
                + "\n";
            String text = context.text();
            int allowed = Math.max(0, remainingChars - header.length() - 2);
            if (text.length() > allowed) {
                text = text.substring(0, allowed).trim();
            }
            builder.append(header).append(text).append("\n\n");
            remainingChars -= header.length() + text.length() + 2;
        }
        appendWebContext(builder, webSearch);
        return builder.toString();
    }

    private static String userPromptFromClientContext(
        String message,
        String clientContextPrompt,
        ChatRoute route,
        WebSearchContext webSearch
    ) {
        String label = route == ChatRoute.COMPOSE || route == ChatRoute.NOTE_ACTION ? "Request" : "Question";
        StringBuilder builder = new StringBuilder();
        builder.append(label)
            .append(":\n")
            .append(message)
            .append("\n\nFrontend selected context:\n")
            .append(clientContextPrompt);
        appendWebContext(builder, webSearch);
        return builder.toString();
    }

    private static void appendWebContext(StringBuilder builder, WebSearchContext webSearch) {
        if (!webSearch.available()) {
            return;
        }
        builder.append("\n\nWeb context:\n")
            .append("Search query: ")
            .append(webSearch.query())
            .append('\n')
            .append("Provider: ")
            .append(webSearch.provider())
            .append('\n');
        if (StringUtils.hasText(webSearch.answer())) {
            builder.append("Provider summary:\n")
                .append(webSearch.answer())
                .append("\n\n");
        }
        if (!webSearch.sources().isEmpty()) {
            builder.append("Web sources:\n");
            for (ChatWebSource source : webSearch.sources()) {
                builder.append("[W")
                    .append(source.rank())
                    .append("] title=")
                    .append(source.title())
                    .append(", url=")
                    .append(source.url())
                    .append('\n');
                if (StringUtils.hasText(source.snippet())) {
                    builder.append(source.snippet()).append('\n');
                }
                builder.append('\n');
            }
        }
    }

    private static boolean requiresNoteContext(ChatRoute route) {
        return route == ChatRoute.NOTE_QA || route == ChatRoute.WORKSPACE_SEARCH;
    }

    private static boolean isDraftSaveRoute(ChatRoute route) {
        return route == ChatRoute.COMPOSE || route == ChatRoute.NOTE_ACTION;
    }

    private static String clientContextPrompt(Map<String, Object> clientContext) {
        if (clientContext == null || clientContext.isEmpty()) {
            return "";
        }
        Object itemsValue = clientContext.get("items");
        if (!(itemsValue instanceof List<?> items) || items.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        Object mode = clientContext.get("mode");
        Object source = clientContext.get("source");
        builder.append("mode=").append(mode == null ? "UNKNOWN" : mode)
            .append(", source=").append(source == null ? "UNKNOWN" : source)
            .append('\n');

        int index = 1;
        for (Object itemValue : items) {
            if (!(itemValue instanceof Map<?, ?> item)) {
                continue;
            }
            String text = stringValue(item.get("text"));
            if (!StringUtils.hasText(text)) {
                continue;
            }
            builder.append('[').append(index).append("] type=").append(stringValue(item.get("type")));
            String noteId = stringValue(item.get("noteId"));
            if (StringUtils.hasText(noteId)) {
                builder.append(", noteId=").append(noteId);
            }
            String documentGroupId = stringValue(item.get("documentGroupId"));
            if (StringUtils.hasText(documentGroupId)) {
                builder.append(", documentGroupId=").append(documentGroupId);
            }
            if (Boolean.TRUE.equals(item.get("truncated"))) {
                builder.append(", truncated=true");
            }
            builder.append('\n').append(text).append("\n\n");
            index += 1;
        }
        return index == 1 ? "" : builder.toString().trim();
    }

    private static boolean isRightSidebarContext(Map<String, Object> clientContext) {
        if (clientContext == null || clientContext.isEmpty()) {
            return false;
        }
        return "RIGHT_SIDEBAR".equals(stringValue(clientContext.get("source")));
    }

    private static int clientContextContentLength(Map<String, Object> clientContext) {
        if (clientContext == null || clientContext.isEmpty()) {
            return 0;
        }
        Object itemsValue = clientContext.get("items");
        if (!(itemsValue instanceof List<?> items) || items.isEmpty()) {
            return 0;
        }
        int length = 0;
        for (Object itemValue : items) {
            if (!(itemValue instanceof Map<?, ?> item)) {
                continue;
            }
            if ("NOTE_TITLE".equals(stringValue(item.get("type")))) {
                continue;
            }
            String text = stringValue(item.get("text")).trim();
            if (StringUtils.hasText(text)) {
                length += text.length();
            }
        }
        return length;
    }

    private static List<AiChatMessage> promptMessages(
        String systemPrompt,
        List<ChatMessage> history,
        String userPrompt
    ) {
        List<AiChatMessage> messages = new java.util.ArrayList<>();
        messages.add(new AiChatMessage(AiRole.SYSTEM, systemPrompt));
        recentHistory(history).forEach(message -> messages.add(new AiChatMessage(
            message.role() == ChatRole.ASSISTANT ? AiRole.ASSISTANT : AiRole.USER,
            message.content()
        )));
        messages.add(new AiChatMessage(AiRole.USER, userPrompt));
        return List.copyOf(messages);
    }

    private static List<ChatMessage> recentHistory(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        int fromIndex = Math.max(0, messages.size() - HISTORY_LIMIT);
        return messages.subList(fromIndex, messages.size());
    }

    private static String historyPrompt(List<ChatMessage> history) {
        StringBuilder builder = new StringBuilder();
        for (ChatMessage message : recentHistory(history)) {
            builder.append(message.role().name()).append(": ").append(message.content()).append('\n');
        }
        return builder.toString();
    }

    private ChatTokenUsage estimatedUsage(String modelId, String prompt, String answer) {
        int inputTokens = estimateTokens(prompt);
        int outputTokens = estimateTokens(answer);
        TokenCostEstimate cost = usageCostEstimator.estimate(modelId, inputTokens, 0, outputTokens);
        return new ChatTokenUsage(
            inputTokens,
            0,
            inputTokens,
            outputTokens,
            0,
            inputTokens + outputTokens,
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode()
        );
    }

    private int contextLimit() {
        return NoteChunkSearchQuery.normalizeTopK(properties.getTopK());
    }

    private int retrievalTopK() {
        return NoteChunkSearchQuery.normalizeTopK(contextLimit() * properties.getMaxChunksPerNote());
    }

    private static void validateNoteScope(ChatThread thread, Map<String, Object> noteScope) {
        if (noteScope == null || !noteScope.containsKey("documentGroupId")) {
            return;
        }
        Object value = noteScope.get("documentGroupId");
        String scopedDocumentGroupId = DocumentGroups.normalize(value == null ? null : value.toString());
        if (!thread.documentGroupId().equals(scopedDocumentGroupId)) {
            throw new ChatDomainException("noteScope.documentGroupId must match thread documentGroupId.");
        }
    }

    private static Map<String, Object> messageMap(ChatMessage message, LlmFeedbackRating feedbackRating) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("messageId", message.messageId());
        values.put("threadId", message.threadId());
        values.put("role", message.role().name());
        values.put("content", message.content());
        values.put("modelId", message.modelId());
        values.put("noteScope", message.noteScope());
        values.put("clientContext", message.clientContext());
        values.put("citations", message.citations().stream().map(ChatCitation::toMap).toList());
        values.put("webSources", message.webSources().stream().map(ChatWebSource::toMap).toList());
        values.put("tokenUsage", message.tokenUsage() == null ? null : message.tokenUsage().toMap());
        values.put("llmRunId", message.llmRunId());
        values.put("route", message.route() == null ? null : message.route().name());
        values.put("savedDraftNoteId", message.savedDraftNoteId());
        values.put("feedbackRating", feedbackRating == null ? null : feedbackRating.name());
        values.put("createdAt", message.createdAt());
        return values;
    }

    private static String promptKey(ChatRoute route) {
        return switch (route) {
            case NOTE_QA -> "chat.note-qa";
            case WORKSPACE_SEARCH -> "chat.workspace-search";
            case COMPOSE -> "chat.compose";
            case NOTE_ACTION -> "chat.note-action";
            case OUT_OF_SCOPE -> "chat.out-of-scope";
        };
    }

    private static String promptKey(ChatRoute route, WebSearchContext webSearch) {
        if (!webSearch.available()) {
            return promptKey(route);
        }
        return switch (route) {
            case NOTE_QA -> "chat.note-qa.web-search";
            case WORKSPACE_SEARCH -> "chat.workspace-search.web-search";
            case COMPOSE -> "chat.compose.web-search";
            case NOTE_ACTION -> "chat.note-action.web-search";
            case OUT_OF_SCOPE -> "chat.web-search";
        };
    }

    private static Map<String, Object> runMetadata(String threadId, ChatRoute route, WebSearchContext webSearch) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("threadId", threadId);
        metadata.put("route", route.name());
        metadata.put("requiresWebSearch", webSearch.available());
        if (webSearch.available()) {
            metadata.put("webSearchProvider", webSearch.provider());
            metadata.put("webSearchModelId", webSearch.modelId());
            metadata.put("webSearchResponseId", webSearch.responseId());
            metadata.put("webSourceCount", webSearch.sources().size());
        }
        return metadata;
    }

    private static AiTokenUsage toAiTokenUsage(ChatTokenUsage tokenUsage) {
        if (tokenUsage == null) {
            return new AiTokenUsage(null, null, null);
        }
        return new AiTokenUsage(
            tokenUsage.inputTokens(),
            tokenUsage.outputTokens(),
            tokenUsage.totalTokens(),
            tokenUsage.cachedInputTokens(),
            tokenUsage.reasoningTokens()
        );
    }

    private static ChatThreadResult toThreadResult(ChatThread thread) {
        return new ChatThreadResult(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt(),
            thread.archivedAt(),
            thread.deletedAt()
        );
    }

    private static ThreadView toThreadView(ChatThread thread) {
        return new ThreadView(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt(),
            thread.archivedAt(),
            thread.deletedAt()
        );
    }

    private static ChatThreadUpdateResult toThreadUpdateResult(ChatThread thread) {
        return new ChatThreadUpdateResult(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt(),
            thread.archivedAt(),
            thread.deletedAt()
        );
    }

    private static ChatThreadListItem toThreadListItem(ChatThreadSummary summary) {
        return new ChatThreadListItem(
            summary.threadId(),
            summary.documentGroupId(),
            summary.title(),
            summary.modelId(),
            summary.createdAt(),
            summary.archivedAt(),
            summary.deletedAt(),
            summary.lastMessageAt(),
            preview(summary.lastMessagePreview()),
            summary.messageCount()
        );
    }

    private static int normalizeThreadListLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_THREAD_LIST_LIMIT;
        }
        if (limit < 1 || limit > MAX_THREAD_LIST_LIMIT) {
            throw new ChatDomainException("limit must be between 1 and 50.");
        }
        return limit;
    }

    private static String encodeThreadListCursor(ChatThreadSummary summary) {
        String value = summary.lastMessageAt() + "|" + summary.threadId();
        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static ChatThreadSummaryCursor decodeThreadListCursor(String cursor) {
        if (!StringUtils.hasText(cursor)) {
            return null;
        }
        try {
            String padded = cursor.trim();
            int padding = padded.length() % 4;
            if (padding > 0) {
                padded = padded + "=".repeat(4 - padding);
            }
            String decoded = new String(Base64.getUrlDecoder().decode(padded), StandardCharsets.UTF_8);
            int separator = decoded.indexOf('|');
            if (separator <= 0 || separator == decoded.length() - 1) {
                throw new IllegalArgumentException("Invalid cursor format.");
            }
            return new ChatThreadSummaryCursor(
                Instant.parse(decoded.substring(0, separator)),
                requireText(decoded.substring(separator + 1), "cursor.threadId")
            );
        } catch (RuntimeException exception) {
            throw new ChatDomainException("Invalid chat thread cursor.");
        }
    }

    private static String preview(String content) {
        if (!StringUtils.hasText(content)) {
            return null;
        }
        String normalized = content.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= THREAD_PREVIEW_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, THREAD_PREVIEW_LENGTH).trim();
    }

    private static String sourceLabel(ChatCitation citation) {
        if (StringUtils.hasText(citation.sourcePath())) {
            return ", sourcePath=" + citation.sourcePath();
        }
        if (StringUtils.hasText(citation.sourceFilename())) {
            return ", sourceFilename=" + citation.sourceFilename();
        }
        return "";
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new ChatDomainException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (int) Math.ceil(safeText.length() / 4.0d));
    }

    private static String safeMessage(Throwable exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "RAG chat stream failed." : message;
    }

    private static String streamErrorCode(Throwable exception) {
        return exception instanceof CapabilityForbiddenException ? "FORBIDDEN" : "STREAM_ERROR";
    }

    private record RagContext(ChatCitation citation, String text) {
    }

    private static final class PerNoteChunkLimit {

        private final int maxChunksPerNote;
        private final Map<String, Integer> counts = new LinkedHashMap<>();

        private PerNoteChunkLimit(int maxChunksPerNote) {
            this.maxChunksPerNote = Math.max(1, maxChunksPerNote);
        }

        private boolean allow(RagContext context) {
            String noteId = context.citation().noteId();
            int current = counts.getOrDefault(noteId, 0);
            if (current >= maxChunksPerNote) {
                return false;
            }
            counts.put(noteId, current + 1);
            return true;
        }
    }
}
