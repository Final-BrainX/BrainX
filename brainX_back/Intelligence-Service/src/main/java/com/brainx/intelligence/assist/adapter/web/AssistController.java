package com.brainx.intelligence.assist.adapter.web;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistCommand;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistResult;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase.AiSuggestionDecisionCommand;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@Validated
public class AssistController {

    private final CreateInlineAssistUseCase createInlineAssistUseCase;
    private final DecideAiSuggestionUseCase decideAiSuggestionUseCase;
    private final ObjectMapper objectMapper;

    public AssistController(
        CreateInlineAssistUseCase createInlineAssistUseCase,
        DecideAiSuggestionUseCase decideAiSuggestionUseCase,
        ObjectMapper objectMapper
    ) {
        this.createInlineAssistUseCase = createInlineAssistUseCase;
        this.decideAiSuggestionUseCase = decideAiSuggestionUseCase;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/api/v1/ai/inline-assists", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<String> createInlineAssist(
        Principal principal,
        @Valid @RequestBody InlineAssistRequest request
    ) {
        InlineAssistResult result = createInlineAssistUseCase.createInlineAssist(new InlineAssistCommand(
            userId(principal),
            request.noteId(),
            request.selectedText(),
            request.contextBefore(),
            request.contextAfter(),
            request.action(),
            request.language(),
            request.draftPrompt(),
            request.targetLength()
        ));

        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(sseBody(result));
    }

    @PostMapping("/api/v1/ai/suggestions/{suggestionId}/decision")
    public ApiSuccessResponse<AiSuggestionDecisionData> decideAiSuggestion(
        Principal principal,
        @PathVariable @NotBlank String suggestionId,
        @Valid @RequestBody AiSuggestionDecisionRequest request
    ) {
        var result = decideAiSuggestionUseCase.decideAiSuggestion(new AiSuggestionDecisionCommand(
            userId(principal),
            suggestionId,
            request.decision()
        ));

        return ApiSuccessResponse.ok(new AiSuggestionDecisionData(
            result.suggestionId(),
            result.decision()
        ));
    }

    private String sseBody(InlineAssistResult result) {
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("text", result.text());

        Map<String, Object> done = new LinkedHashMap<>();
        done.put("suggestionId", result.suggestionId());
        done.put("action", result.action());
        done.put("modelId", result.modelId());

        return sse("delta", delta) + sse("done", done);
    }

    private String sse(String eventName, Map<String, Object> data) {
        return "event: " + eventName + "\n"
            + "data: " + json(data) + "\n\n";
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

    record InlineAssistRequest(
        @NotBlank String noteId,
        String selectedText,
        String contextBefore,
        String contextAfter,
        @NotNull InlineAssistAction action,
        String draftPrompt,
        Integer targetLength,
        String language
    ) {
    }

    record AiSuggestionDecisionRequest(
        @NotNull AiSuggestionDecision decision
    ) {
    }

    record AiSuggestionDecisionData(
        String suggestionId,
        AiSuggestionDecision decision
    ) {
    }
}
