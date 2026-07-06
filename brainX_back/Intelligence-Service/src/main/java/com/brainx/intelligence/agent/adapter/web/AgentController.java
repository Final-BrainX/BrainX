package com.brainx.intelligence.agent.adapter.web;

import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.agent.application.usecase.AgentService;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentActionDecisionCommand;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentActionView;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentMessageView;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentStreamEvent;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentThreadDetailResult;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentThreadListItem;
import com.brainx.intelligence.agent.application.usecase.AgentService.AgentThreadView;
import com.brainx.intelligence.agent.application.usecase.AgentService.CreateAgentThreadCommand;
import com.brainx.intelligence.agent.application.usecase.AgentService.GetAgentThreadQuery;
import com.brainx.intelligence.agent.application.usecase.AgentService.ListAgentThreadsQuery;
import com.brainx.intelligence.agent.application.usecase.AgentService.SendAgentMessageCommand;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentActionType;
import com.brainx.intelligence.agent.domain.AgentRole;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import reactor.core.publisher.Flux;

@RestController
@Validated
public class AgentController {

    private final AgentService agentService;
    private final ObjectMapper objectMapper;

    public AgentController(
        AgentService agentService,
        ObjectMapper objectMapper
    ) {
        this.agentService = agentService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/v1/ai/agent-threads")
    public ApiSuccessResponse<AgentThreadListData> listAgentThreads(
        Principal principal,
        @RequestParam(required = false) @Min(1) @Max(50) Integer limit
    ) {
        var result = agentService.listThreads(new ListAgentThreadsQuery(userId(principal), limit));
        return ApiSuccessResponse.ok(new AgentThreadListData(result.threads().stream()
            .map(AgentController::toListItemData)
            .toList()));
    }

    @PostMapping("/api/v1/ai/agent-threads")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiSuccessResponse<AgentThreadData> createAgentThread(
        Principal principal,
        @Valid @RequestBody AgentThreadCreateRequest request
    ) {
        AgentThreadView thread = agentService.createThread(new CreateAgentThreadCommand(
            userId(principal),
            request.documentGroupId(),
            request.title(),
            request.initialMessage(),
            request.modelId()
        ));
        return ApiSuccessResponse.ok(toThreadData(thread));
    }

    @GetMapping("/api/v1/ai/agent-threads/{threadId}")
    public ApiSuccessResponse<AgentThreadDetailData> getAgentThread(
        Principal principal,
        @PathVariable @NotBlank String threadId
    ) {
        AgentThreadDetailResult result = agentService.getThread(new GetAgentThreadQuery(userId(principal), threadId));
        return ApiSuccessResponse.ok(new AgentThreadDetailData(
            toThreadData(result.thread()),
            result.messages().stream().map(AgentController::toMessageData).toList()
        ));
    }

    @PostMapping(value = "/api/v1/ai/agent-threads/{threadId}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<String>>> sendAgentMessage(
        Principal principal,
        @PathVariable @NotBlank String threadId,
        @Valid @RequestBody AgentMessageCreateRequest request
    ) {
        Flux<ServerSentEvent<String>> body = agentService.sendMessage(new SendAgentMessageCommand(
            userId(principal),
            threadId,
            request.message(),
            clientContextToMap(request.clientContext()),
            request.modelId()
        )).map(this::sse);

        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(body);
    }

    @PostMapping("/api/v1/ai/agent-actions/{actionId}/approve")
    public ApiSuccessResponse<AgentActionData> approveAgentAction(
        Principal principal,
        @PathVariable @NotBlank String actionId
    ) {
        return ApiSuccessResponse.ok(toActionData(agentService.approveAction(new AgentActionDecisionCommand(
            userId(principal),
            actionId
        ))));
    }

    @PostMapping("/api/v1/ai/agent-actions/{actionId}/reject")
    public ApiSuccessResponse<AgentActionData> rejectAgentAction(
        Principal principal,
        @PathVariable @NotBlank String actionId
    ) {
        return ApiSuccessResponse.ok(toActionData(agentService.rejectAction(new AgentActionDecisionCommand(
            userId(principal),
            actionId
        ))));
    }

    private ServerSentEvent<String> sse(AgentStreamEvent event) {
        return ServerSentEvent.builder(json(event.data()))
            .event(event.eventName())
            .build();
    }

    private String json(Map<String, Object> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize SSE payload.", exception);
        }
    }

    private static String userId(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getName() != null && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        throw new IllegalArgumentException("Authenticated user is required.");
    }

    private static Map<String, Object> clientContextToMap(ClientContextRequest clientContext) {
        if (clientContext == null) {
            return Map.of();
        }
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("mode", clientContext.mode());
        values.put("source", clientContext.source());
        values.put("items", clientContext.items() == null
            ? List.of()
            : clientContext.items().stream().map(AiContextItemRequest::toMap).toList());
        return values;
    }

    private static AgentThreadData toThreadData(AgentThreadView thread) {
        return new AgentThreadData(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt()
        );
    }

    private static AgentThreadListItemData toListItemData(AgentThreadListItem thread) {
        return new AgentThreadListItemData(
            thread.threadId(),
            thread.documentGroupId(),
            thread.title(),
            thread.modelId(),
            thread.createdAt(),
            thread.lastMessageAt(),
            thread.lastMessagePreview(),
            thread.messageCount()
        );
    }

    private static AgentMessageData toMessageData(AgentMessageView message) {
        return new AgentMessageData(
            message.messageId(),
            message.threadId(),
            message.role(),
            message.content(),
            message.modelId(),
            message.llmRunId(),
            message.createdAt(),
            message.actions().stream().map(AgentController::toActionData).toList()
        );
    }

    private static AgentActionData toActionData(AgentActionView action) {
        return new AgentActionData(
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

    record AgentThreadCreateRequest(
        String documentGroupId,
        @NotBlank String title,
        String initialMessage,
        @NotBlank String modelId
    ) {
    }

    record AgentMessageCreateRequest(
        @NotBlank String message,
        @Valid ClientContextRequest clientContext,
        @NotBlank String modelId
    ) {
    }

    record ClientContextRequest(
        @NotBlank String mode,
        @NotBlank String source,
        @Valid List<AiContextItemRequest> items
    ) {
    }

    record AiContextItemRequest(
        @NotBlank String type,
        String noteId,
        String documentGroupId,
        @NotBlank String text,
        Boolean truncated,
        Map<String, Object> metadata
    ) {

        Map<String, Object> toMap() {
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("type", type);
            if (noteId != null && !noteId.isBlank()) {
                values.put("noteId", noteId);
            }
            if (documentGroupId != null && !documentGroupId.isBlank()) {
                values.put("documentGroupId", documentGroupId);
            }
            values.put("text", text);
            if (truncated != null) {
                values.put("truncated", truncated);
            }
            if (metadata != null && !metadata.isEmpty()) {
                values.put("metadata", metadata);
            }
            return values;
        }
    }

    record AgentThreadData(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt
    ) {
    }

    record AgentThreadListItemData(
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

    record AgentThreadListData(List<AgentThreadListItemData> threads) {
    }

    record AgentMessageData(
        String messageId,
        String threadId,
        AgentRole role,
        String content,
        String modelId,
        String llmRunId,
        Instant createdAt,
        List<AgentActionData> actions
    ) {
    }

    record AgentActionData(
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

    record AgentThreadDetailData(
        AgentThreadData thread,
        List<AgentMessageData> messages
    ) {
    }
}
