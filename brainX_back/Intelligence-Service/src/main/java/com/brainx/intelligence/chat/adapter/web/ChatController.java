package com.brainx.intelligence.chat.adapter.web;

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

import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.CreateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.GetChatThreadQuery;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ListChatThreadsQuery;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
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
public class ChatController {

    private final CreateChatThreadUseCase createChatThreadUseCase;
    private final ListChatThreadsUseCase listChatThreadsUseCase;
    private final SendChatMessageUseCase sendChatMessageUseCase;
    private final GetChatThreadUseCase getChatThreadUseCase;
    private final ObjectMapper objectMapper;

    public ChatController(
        CreateChatThreadUseCase createChatThreadUseCase,
        ListChatThreadsUseCase listChatThreadsUseCase,
        SendChatMessageUseCase sendChatMessageUseCase,
        GetChatThreadUseCase getChatThreadUseCase,
        ObjectMapper objectMapper
    ) {
        this.createChatThreadUseCase = createChatThreadUseCase;
        this.listChatThreadsUseCase = listChatThreadsUseCase;
        this.sendChatMessageUseCase = sendChatMessageUseCase;
        this.getChatThreadUseCase = getChatThreadUseCase;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/v1/ai/chat-threads")
    public ApiSuccessResponse<ChatThreadListData> listChatThreads(
        Principal principal,
        @RequestParam(required = false) @Min(1) @Max(50) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        var result = listChatThreadsUseCase.listChatThreads(new ListChatThreadsQuery(
            userId(principal),
            limit,
            cursor
        ));

        return ApiSuccessResponse.ok(new ChatThreadListData(
            result.threads().stream()
                .map(thread -> new ChatThreadListItemData(
                    thread.threadId(),
                    thread.documentGroupId(),
                    thread.title(),
                    thread.modelId(),
                    thread.createdAt(),
                    thread.lastMessageAt(),
                    thread.lastMessagePreview(),
                    thread.messageCount()
                ))
                .toList(),
            new ChatThreadListPaginationData(
                result.pagination().limit(),
                result.pagination().nextCursor(),
                result.pagination().hasMore()
            )
        ));
    }

    @PostMapping("/api/v1/ai/chat-threads")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiSuccessResponse<ChatThreadData> createChatThread(
        Principal principal,
        @Valid @RequestBody ChatThreadCreateRequest request
    ) {
        var result = createChatThreadUseCase.createChatThread(new CreateChatThreadCommand(
            userId(principal),
            request.documentGroupId(),
            request.title(),
            request.modelId()
        ));

        return ApiSuccessResponse.ok(new ChatThreadData(
            result.threadId(),
            result.documentGroupId(),
            result.title(),
            result.modelId(),
            result.createdAt()
        ));
    }

    @PostMapping(value = "/api/v1/ai/chat-threads/{threadId}/messages", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<String>>> sendChatMessage(
        Principal principal,
        @PathVariable @NotBlank String threadId,
        @Valid @RequestBody ChatMessageCreateRequest request
    ) {
        Flux<ServerSentEvent<String>> body = sendChatMessageUseCase.sendChatMessage(new SendChatMessageCommand(
            userId(principal),
            threadId,
            request.message(),
            nullToEmpty(request.noteScope()),
            clientContextToMap(request.clientContext()),
            request.modelId()
        )).map(this::sse);

        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(body);
    }

    @GetMapping("/api/v1/ai/chat-threads/{threadId}")
    public ApiSuccessResponse<ChatThreadDetailData> getChatThread(
        Principal principal,
        @PathVariable @NotBlank String threadId
    ) {
        var result = getChatThreadUseCase.getChatThread(new GetChatThreadQuery(userId(principal), threadId));

        var thread = result.thread();
        return ApiSuccessResponse.ok(new ChatThreadDetailData(
            new ChatThreadData(
                thread.threadId(),
                thread.documentGroupId(),
                thread.title(),
                thread.modelId(),
                thread.createdAt()
            ),
            result.messages()
        ));
    }

    private ServerSentEvent<String> sse(ChatStreamEvent event) {
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

    private static Map<String, Object> nullToEmpty(Map<String, Object> values) {
        return values == null ? Map.of() : values;
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

    record ChatThreadCreateRequest(
        String documentGroupId,
        @NotBlank String title,
        @NotBlank String modelId
    ) {
    }

    record ChatMessageCreateRequest(
        @NotBlank String message,
        Map<String, Object> noteScope,
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

    record ChatThreadData(
        String threadId,
        String documentGroupId,
        String title,
        String modelId,
        Instant createdAt
    ) {
    }

    record ChatThreadListItemData(
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

    record ChatThreadListPaginationData(
        int limit,
        String nextCursor,
        boolean hasMore
    ) {
    }

    record ChatThreadListData(
        List<ChatThreadListItemData> threads,
        ChatThreadListPaginationData pagination
    ) {
    }

    record ChatThreadDetailData(
        ChatThreadData thread,
        List<Map<String, Object>> messages
    ) {
    }
}
