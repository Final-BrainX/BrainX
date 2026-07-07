package com.brainx.intelligence.agent.application.usecase;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.agent.application.port.outbound.AgentPersistencePort;
import com.brainx.intelligence.agent.application.port.outbound.AgentNoteSourcePort;
import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentActionType;
import com.brainx.intelligence.agent.domain.AgentConflictException;
import com.brainx.intelligence.agent.domain.AgentDomainException;
import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentNotFoundException;
import com.brainx.intelligence.agent.domain.AgentRole;
import com.brainx.intelligence.agent.domain.AgentThread;
import com.brainx.intelligence.agent.domain.AgentThreadSummary;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.AppendNoteContentCommand;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.CreateNoteCommand;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

@Service
public class AgentService {

    static final String AGENT_CAPABILITY = "RAG_CHAT";
    static final String AGENT_FEATURE_ID = "agent-tab";
    private static final int DEFAULT_THREAD_LIST_LIMIT = 20;
    private static final int MAX_THREAD_LIST_LIMIT = 50;
    private static final int HISTORY_LIMIT = 12;
    private static final int PREVIEW_LENGTH = 180;
    private static final String SYSTEM_PROMPT = """
        You are the BrainX experimental Agent. You chat with the user and may propose safe Workspace actions.

        Hard rules:
        - Do not execute or claim that you executed Workspace mutations.
        - Mutations are only action proposals. The user must approve them separately.
        - Allowed action types are CREATE_NOTE and APPEND_NOTE_CONTENT only.
        - If the target note for APPEND_NOTE_CONTENT is ambiguous or missing, ask a clarifying question and return no action.
        - Return only valid JSON. No markdown fence.

        JSON schema:
        {
          "reply": "short user-facing reply",
          "action": null | {
            "type": "CREATE_NOTE" | "APPEND_NOTE_CONTENT",
            "title": "action card title",
            "summary": "short action explanation",
            "previewMarkdown": "markdown preview for the card",
            "target": {"noteId": "only for append when known", "title": "optional"},
            "payload": {
              "title": "new note title for CREATE_NOTE",
              "markdown": "new note markdown for CREATE_NOTE",
              "noteId": "target note id for APPEND_NOTE_CONTENT",
              "appendMarkdown": "markdown to append for APPEND_NOTE_CONTENT",
              "tags": ["optional", "strings"]
            }
          }
        }
        """;

    private final AgentPersistencePort persistencePort;
    private final AiChatPort aiChatPort;
    private final EntitlementPort entitlementPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final WorkspaceNotePort workspaceNotePort;
    private final AgentNoteSourcePort agentNoteSourcePort;
    private final AgentPlanParser planParser;

    public AgentService(
        AgentPersistencePort persistencePort,
        AiChatPort aiChatPort,
        EntitlementPort entitlementPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        WorkspaceNotePort workspaceNotePort,
        AgentNoteSourcePort agentNoteSourcePort,
        ObjectMapper objectMapper
    ) {
        this.persistencePort = persistencePort;
        this.aiChatPort = aiChatPort;
        this.entitlementPort = entitlementPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.workspaceNotePort = workspaceNotePort;
        this.agentNoteSourcePort = agentNoteSourcePort;
        this.planParser = new AgentPlanParser(objectMapper);
    }

    public AgentThreadView createThread(CreateAgentThreadCommand command) {
        String userId = requireText(command.userId(), "userId");
        String modelId = requireText(command.modelId(), "modelId");
        String title = title(command.title(), command.initialMessage());
        AgentThread thread = persistencePort.saveThread(new AgentThread(
            UUID.randomUUID().toString(),
            userId,
            command.documentGroupId(),
            title,
            modelId,
            Instant.now()
        ));
        return toThreadView(thread);
    }

    public AgentThreadListResult listThreads(ListAgentThreadsQuery query) {
        String userId = requireText(query.userId(), "userId");
        int limit = normalizeLimit(query.limit());
        return new AgentThreadListResult(persistencePort.findThreadSummariesByUserId(userId, limit).stream()
            .map(AgentService::toThreadListItem)
            .toList());
    }

    public AgentThreadDetailResult getThread(GetAgentThreadQuery query) {
        String userId = requireText(query.userId(), "userId");
        String threadId = requireText(query.threadId(), "threadId");
        AgentThread thread = persistencePort.findThreadByUserIdAndThreadId(userId, threadId)
            .orElseThrow(() -> new AgentNotFoundException("Agent thread not found: " + threadId));
        return detail(userId, thread);
    }

    public Flux<AgentStreamEvent> sendMessage(SendAgentMessageCommand command) {
        String userId = requireText(command.userId(), "userId");
        String threadId = requireText(command.threadId(), "threadId");
        String message = requireText(command.message(), "message");
        String modelId = requireText(command.modelId(), "modelId");
        AgentThread thread = persistencePort.findThreadByUserIdAndThreadId(userId, threadId)
            .orElseThrow(() -> new AgentNotFoundException("Agent thread not found: " + threadId));
        if (!thread.modelId().equals(modelId)) {
            throw new AgentDomainException("modelId must match the Agent thread modelId.");
        }

        AgentMessage userMessage = persistencePort.saveMessage(AgentMessage.user(
            UUID.randomUUID().toString(),
            thread.threadId(),
            userId,
            message,
            modelId,
            command.clientContext(),
            Instant.now()
        ));
        List<AgentMessage> history = persistencePort.findMessagesByUserIdAndThreadId(userId, threadId).stream()
            .filter(item -> !item.messageId().equals(userMessage.messageId()))
            .toList();
        PromptResolution promptResolution = promptRegistryService.resolve("agent.planner", SYSTEM_PROMPT);
        checkEntitlement(userId, modelId, history, message, promptResolution.content());

        try {
            String agentMessageId = UUID.randomUUID().toString();
            RecordedAgentPlan recordedPlan = plan(thread, history, userMessage, agentMessageId, promptResolution);
            AgentPlan plan = recordedPlan.plan();
            AgentMessage agentMessage = persistencePort.saveMessage(AgentMessage.agent(
                agentMessageId,
                thread.threadId(),
                userId,
                StringUtils.hasText(plan.reply()) ? plan.reply() : "실행할 수 있는 작업을 확인했습니다.",
                modelId,
                recordedPlan.llmRunId(),
                Instant.now()
            ));
            List<AgentStreamEvent> events = new ArrayList<>();
            events.add(AgentStreamEvent.delta(agentMessage.content()));
            AgentAction action = createActionIfValid(thread, agentMessage, plan);
            if (action != null) {
                AgentAction saved = persistencePort.saveAction(action);
                events.add(AgentStreamEvent.actionProposed(toActionView(saved)));
            }
            events.add(AgentStreamEvent.done(agentMessage.messageId(), agentMessage.llmRunId()));
            return Flux.fromIterable(events);
        } catch (RuntimeException exception) {
            return Flux.just(AgentStreamEvent.error("AGENT_PLANNER_FAILED", safeMessage(exception)));
        }
    }

    public AgentActionView approveAction(AgentActionDecisionCommand command) {
        String userId = requireText(command.userId(), "userId");
        String actionId = requireText(command.actionId(), "actionId");
        Instant now = Instant.now();
        AgentAction executing = persistencePort.claimPendingActionForExecution(userId, actionId, now)
            .orElseThrow(() -> actionTransitionException(userId, actionId));
        try {
            AgentAction completed = persistencePort.saveAction(execute(executing, now));
            return toActionView(completed);
        } catch (RuntimeException exception) {
            AgentAction failed = persistencePort.saveAction(executing.failed("AGENT_ACTION_FAILED", safeMessage(exception), Instant.now()));
            return toActionView(failed);
        }
    }

    public AgentActionView rejectAction(AgentActionDecisionCommand command) {
        String userId = requireText(command.userId(), "userId");
        String actionId = requireText(command.actionId(), "actionId");
        AgentAction rejected = persistencePort.rejectPendingAction(userId, actionId, Instant.now())
            .orElseThrow(() -> actionTransitionException(userId, actionId));
        return toActionView(rejected);
    }

    private AgentThreadDetailResult detail(String userId, AgentThread thread) {
        Map<String, List<AgentAction>> actionsByMessageId = persistencePort
            .findActionsByUserIdAndThreadId(userId, thread.threadId())
            .stream()
            .sorted(Comparator.comparing(AgentAction::createdAt))
            .collect(Collectors.groupingBy(AgentAction::messageId, LinkedHashMap::new, Collectors.toList()));
        List<AgentMessageView> messages = persistencePort.findMessagesByUserIdAndThreadId(userId, thread.threadId()).stream()
            .map(message -> toMessageView(message, actionsByMessageId.getOrDefault(message.messageId(), List.of())))
            .toList();
        return new AgentThreadDetailResult(toThreadView(thread), messages);
    }

    private RecordedAgentPlan plan(
        AgentThread thread,
        List<AgentMessage> history,
        AgentMessage userMessage,
        String agentMessageId,
        PromptResolution promptResolution
    ) {
        List<AiChatMessage> prompt = new ArrayList<>();
        prompt.add(new AiChatMessage(AiRole.SYSTEM, promptResolution.template()));
        prompt.add(new AiChatMessage(AiRole.USER, agentContextPrompt(thread, history, userMessage)));
        AiRunRecorder.RecordedChatResponse recorded = aiRunRecorder.recordChatGenerateWithRun(
            thread.userId(),
            AGENT_FEATURE_ID,
            promptResolution.promptKey(),
            promptResolution.version(),
            userMessage.modelId(),
            "AGENT_MESSAGE",
            agentMessageId,
            prompt,
            Map.of(
                "threadId", thread.threadId(),
                "documentGroupId", thread.documentGroupId(),
                "userMessageId", userMessage.messageId()
            ),
            () -> aiChatPort.generate(new AiChatRequest(userMessage.modelId(), prompt))
        );
        AiChatResponse response = recorded.response();
        if (response != null) {
            aiUsageRecorder.recordChatUsage(thread.userId(), AGENT_FEATURE_ID, userMessage.modelId(), agentMessageId, response.tokenUsage());
        }
        String content = response == null || response.content() == null ? "" : response.content();
        return new RecordedAgentPlan(recorded.llmRunId(), AgentPlan.fromJson(parseJson(content)));
    }

    private void checkEntitlement(String userId, String modelId, List<AgentMessage> history, String message, String systemPrompt) {
        int estimate = estimateTokens(systemPrompt + historyPrompt(history) + message);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(userId, AGENT_CAPABILITY, estimate));
        if (!entitlement.allowed()) {
            throw new AgentDomainException("AI capability is not available: " + entitlement.reasonCode());
        }
    }

    private AgentAction createActionIfValid(AgentThread thread, AgentMessage agentMessage, AgentPlan plan) {
        if (plan.action() == null || plan.action().isEmpty()) {
            return null;
        }
        AgentActionType type = actionType(plan.action().get("type"));
        if (type == null) {
            return null;
        }
        Map<String, Object> payload = mapValue(plan.action().get("payload"));
        Map<String, Object> target = mapValue(plan.action().get("target"));
        if (!validPayload(type, payload)) {
            return null;
        }
        String title = stringValue(plan.action().get("title"));
        String summary = stringValue(plan.action().get("summary"));
        String preview = stringValue(plan.action().get("previewMarkdown"));
        if (!StringUtils.hasText(preview)) {
            preview = type == AgentActionType.CREATE_NOTE
                ? stringValue(payload.get("markdown"))
                : stringValue(payload.get("appendMarkdown"));
        }
        return new AgentAction(
            UUID.randomUUID().toString(),
            thread.userId(),
            thread.threadId(),
            agentMessage.messageId(),
            type,
            AgentActionStatus.PENDING_APPROVAL,
            StringUtils.hasText(title) ? title : defaultActionTitle(type),
            summary,
            preview,
            thread.documentGroupId(),
            target,
            payload,
            null,
            null,
            Instant.now(),
            null,
            null
        );
    }

    private AgentAction execute(AgentAction action, Instant now) {
        return switch (action.actionType()) {
            case CREATE_NOTE -> executeCreateNote(action, now);
            case APPEND_NOTE_CONTENT -> executeAppendNoteContent(action, now);
        };
    }

    private AgentAction executeCreateNote(AgentAction action, Instant now) {
        String title = firstText(action.payload().get("title"), action.title());
        String markdown = firstText(action.payload().get("markdown"), action.previewMarkdown());
        var created = workspaceNotePort.createNoteFromAgent(new CreateNoteCommand(
            action.userId(),
            action.documentGroupId(),
            action.actionId(),
            title,
            markdown,
            stringList(action.payload().get("tags")),
            blankToNull(action.payload().get("targetFolderId"))
        ));
        return action.succeeded(Map.of(
            "noteId", created.noteId(),
            "version", created.version()
        ), now);
    }

    private AgentAction executeAppendNoteContent(AgentAction action, Instant now) {
        String noteId = requireText(stringValue(action.payload().get("noteId")), "payload.noteId");
        String appendMarkdown = requireText(stringValue(action.payload().get("appendMarkdown")), "payload.appendMarkdown");
        var target = agentNoteSourcePort
            .findSearchableAgentNoteSource(action.userId(), action.documentGroupId(), noteId)
            .orElseThrow(() -> new AgentNotFoundException("Target note is not available: " + noteId));
        var snapshot = workspaceNotePort.getNoteSnapshot(target.noteId());
        var patched = workspaceNotePort.appendNoteContentFromAgent(new AppendNoteContentCommand(
            action.userId(),
            action.documentGroupId(),
            target.noteId(),
            action.actionId(),
            snapshot.version(),
            appendMarkdown
        ));
        return action.succeeded(Map.of(
            "noteId", patched.noteId(),
            "version", patched.version(),
            "savedAt", patched.savedAt()
        ), now);
    }

    private Map<String, Object> parseJson(String content) {
        return planParser.parseJson(content);
    }

    private static String agentContextPrompt(AgentThread thread, List<AgentMessage> history, AgentMessage userMessage) {
        StringBuilder builder = new StringBuilder();
        builder.append("Thread documentGroupId: ").append(thread.documentGroupId()).append('\n');
        builder.append("Recent conversation:\n");
        for (AgentMessage message : recentHistory(history)) {
            builder.append(message.role().name()).append(": ").append(message.content()).append("\n\n");
        }
        builder.append("Current user request:\n").append(userMessage.content());
        return builder.toString();
    }

    private static List<AgentMessage> recentHistory(List<AgentMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        int fromIndex = Math.max(0, messages.size() - HISTORY_LIMIT);
        return messages.subList(fromIndex, messages.size());
    }

    private static String historyPrompt(List<AgentMessage> history) {
        StringBuilder builder = new StringBuilder();
        for (AgentMessage message : recentHistory(history)) {
            builder.append(message.role().name()).append(": ").append(message.content()).append('\n');
        }
        return builder.toString();
    }

    private static boolean validPayload(AgentActionType type, Map<String, Object> payload) {
        return switch (type) {
            case CREATE_NOTE -> StringUtils.hasText(stringValue(payload.get("title")))
                && StringUtils.hasText(stringValue(payload.get("markdown")));
            case APPEND_NOTE_CONTENT -> StringUtils.hasText(stringValue(payload.get("noteId")))
                && StringUtils.hasText(stringValue(payload.get("appendMarkdown")));
        };
    }

    private static AgentActionType actionType(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return AgentActionType.valueOf(value.toString().trim());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static String defaultActionTitle(AgentActionType type) {
        return switch (type) {
            case CREATE_NOTE -> "새 노트 생성";
            case APPEND_NOTE_CONTENT -> "기존 노트에 추가";
        };
    }

    private static String title(String title, String initialMessage) {
        if (StringUtils.hasText(title)) {
            return trimTo(title, 80);
        }
        if (StringUtils.hasText(initialMessage)) {
            return trimTo(initialMessage, 80);
        }
        return "Agent thread";
    }

    private static int normalizeLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_THREAD_LIST_LIMIT;
        }
        if (limit < 1 || limit > MAX_THREAD_LIST_LIMIT) {
            throw new AgentDomainException("limit must be between 1 and 50.");
        }
        return limit;
    }

    private static int estimateTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return Math.max(1, text.length() / 4);
    }

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> source) || source.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        source.forEach((key, item) -> {
            if (key != null) {
                result.put(key.toString(), item);
            }
        });
        return result;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        return items.stream()
            .map(item -> item == null ? "" : item.toString().trim())
            .filter(StringUtils::hasText)
            .distinct()
            .toList();
    }

    private static String firstText(Object first, String fallback) {
        String value = stringValue(first);
        return StringUtils.hasText(value) ? value : fallback;
    }

    private static String stringValue(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString().trim();
    }

    private static String blankToNull(Object value) {
        String text = stringValue(value);
        return StringUtils.hasText(text) ? text : null;
    }

    private static String trimTo(String value, int maxLength) {
        String text = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength).trim();
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new AgentDomainException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Agent operation failed." : message;
    }

    private RuntimeException actionTransitionException(String userId, String actionId) {
        if (persistencePort.findActionByUserIdAndActionId(userId, actionId).isEmpty()) {
            return new AgentNotFoundException("Agent action not found: " + actionId);
        }
        return new AgentConflictException("Agent action is not pending approval.");
    }

    private static AgentThreadView toThreadView(AgentThread thread) {
        return new AgentThreadView(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt()
        );
    }

    private static AgentThreadListItem toThreadListItem(AgentThreadSummary summary) {
        return new AgentThreadListItem(
            summary.threadId(),
            summary.documentGroupId(),
            summary.title(),
            summary.modelId(),
            summary.createdAt(),
            summary.lastMessageAt(),
            summary.lastMessagePreview(),
            summary.messageCount()
        );
    }

    private static AgentMessageView toMessageView(AgentMessage message, List<AgentAction> actions) {
        return new AgentMessageView(
            message.messageId(),
            message.threadId(),
            message.role(),
            message.content(),
            message.modelId(),
            message.llmRunId(),
            message.createdAt(),
            actions.stream().map(AgentService::toActionView).toList()
        );
    }

    private static AgentActionView toActionView(AgentAction action) {
        return new AgentActionView(
            action.actionId(),
            action.threadId(),
            action.messageId(),
            action.actionType(),
            action.status(),
            action.title(),
            action.summary(),
            action.previewMarkdown(),
            action.documentGroupId(),
            action.target(),
            action.payload(),
            action.result(),
            action.error(),
            action.createdAt(),
            action.decidedAt(),
            action.executedAt()
        );
    }

    record AgentPlan(String reply, Map<String, Object> action) {

        static AgentPlan fromJson(Map<String, Object> values) {
            return new AgentPlan(stringValue(values.get("reply")), mapOrNull(values.get("action")));
        }

        private static Map<String, Object> mapOrNull(Object value) {
            if (!(value instanceof Map<?, ?> source) || source.isEmpty()) {
                return null;
            }
            return mapValue(source);
        }
    }

    record RecordedAgentPlan(String llmRunId, AgentPlan plan) {
    }

    public record CreateAgentThreadCommand(
        String userId,
        String documentGroupId,
        String title,
        String initialMessage,
        String modelId
    ) {
    }

    public record ListAgentThreadsQuery(String userId, Integer limit) {
    }

    public record GetAgentThreadQuery(String userId, String threadId) {
    }

    public record SendAgentMessageCommand(
        String userId,
        String threadId,
        String message,
        Map<String, Object> clientContext,
        String modelId
    ) {
    }

    public record AgentActionDecisionCommand(String userId, String actionId) {
    }

    public record AgentThreadView(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt
    ) {
    }

    public record AgentThreadListItem(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt,
        Instant lastMessageAt,
        String lastMessagePreview,
        long messageCount
    ) {
    }

    public record AgentThreadListResult(List<AgentThreadListItem> threads) {
    }

    public record AgentMessageView(
        String messageId,
        String threadId,
        AgentRole role,
        String content,
        String modelId,
        String llmRunId,
        Instant createdAt,
        List<AgentActionView> actions
    ) {
    }

    public record AgentThreadDetailResult(
        AgentThreadView thread,
        List<AgentMessageView> messages
    ) {
    }

    public record AgentActionView(
        String actionId,
        String threadId,
        String messageId,
        AgentActionType actionType,
        AgentActionStatus status,
        String title,
        String summary,
        String previewMarkdown,
        String documentGroupId,
        Map<String, Object> target,
        Map<String, Object> payload,
        Map<String, Object> result,
        Map<String, Object> error,
        Instant createdAt,
        Instant decidedAt,
        Instant executedAt
    ) {
    }

    public record AgentStreamEvent(String eventName, Map<String, Object> data) {

        public static AgentStreamEvent delta(String text) {
            return new AgentStreamEvent("delta", Map.of("text", text == null ? "" : text));
        }

        public static AgentStreamEvent actionProposed(AgentActionView action) {
            return new AgentStreamEvent("action_proposed", actionMap(action));
        }

        public static AgentStreamEvent actionStatus(AgentActionView action) {
            return new AgentStreamEvent("action_status", actionMap(action));
        }

        public static AgentStreamEvent actionResult(AgentActionView action) {
            return new AgentStreamEvent("action_result", actionMap(action));
        }

        public static AgentStreamEvent done(String messageId) {
            return done(messageId, null);
        }

        public static AgentStreamEvent done(String messageId, String llmRunId) {
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("messageId", messageId);
            if (StringUtils.hasText(llmRunId)) {
                values.put("llmRunId", llmRunId);
            }
            return new AgentStreamEvent("done", values);
        }

        public static AgentStreamEvent error(String code, String message) {
            return new AgentStreamEvent("error", Map.of(
                "code", code == null || code.isBlank() ? "AGENT_STREAM_ERROR" : code,
                "message", message == null || message.isBlank() ? "Agent stream failed." : message
            ));
        }

        private static Map<String, Object> actionMap(AgentActionView action) {
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("actionId", action.actionId());
            values.put("threadId", action.threadId());
            values.put("messageId", action.messageId());
            values.put("actionType", action.actionType().name());
            values.put("status", action.status().name());
            values.put("title", action.title());
            values.put("summary", action.summary());
            values.put("previewMarkdown", action.previewMarkdown());
            values.put("documentGroupId", action.documentGroupId());
            values.put("target", action.target());
            values.put("payload", action.payload());
            values.put("result", action.result());
            values.put("error", action.error());
            values.put("createdAt", action.createdAt());
            values.put("decidedAt", action.decidedAt());
            values.put("executedAt", action.executedAt());
            return values;
        }
    }
}
