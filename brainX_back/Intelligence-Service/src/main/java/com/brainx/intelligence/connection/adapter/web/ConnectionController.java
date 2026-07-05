package com.brainx.intelligence.connection.adapter.web;

import java.security.Principal;
import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

@RestController
@Validated
public class ConnectionController {

    private final CreateLinkSuggestionsUseCase createLinkSuggestionsUseCase;
    private final CreateBridgeConceptsUseCase createBridgeConceptsUseCase;

    public ConnectionController(
        CreateLinkSuggestionsUseCase createLinkSuggestionsUseCase,
        CreateBridgeConceptsUseCase createBridgeConceptsUseCase
    ) {
        this.createLinkSuggestionsUseCase = createLinkSuggestionsUseCase;
        this.createBridgeConceptsUseCase = createBridgeConceptsUseCase;
    }

    @PostMapping("/api/v1/ai/link-suggestions")
    public ApiSuccessResponse<LinkSuggestionsData> createLinkSuggestions(
        Principal principal,
        @Valid @RequestBody LinkSuggestionsRequest request
    ) {
        var result = createLinkSuggestionsUseCase.createLinkSuggestions(new LinkSuggestionsCommand(
            userId(principal),
            request.noteId()
        ));

        return ApiSuccessResponse.ok(new LinkSuggestionsData(
            result.suggestions().stream()
                .map(suggestion -> new LinkSuggestionData(
                    suggestion.suggestionId(),
                    suggestion.targetNoteId(),
                    suggestion.targetTitle(),
                    suggestion.score(),
                    suggestion.reason(),
                    suggestion.anchorText(),
                    suggestion.anchorStartOffset(),
                    suggestion.anchorEndOffset()
                ))
                .toList()
        ));
    }

    @PostMapping("/api/v1/ai/bridge-concepts")
    public ApiSuccessResponse<BridgeConceptsData> createBridgeConcepts(
        Principal principal,
        @Valid @RequestBody BridgeConceptsRequest request
    ) {
        var result = createBridgeConceptsUseCase.createBridgeConcepts(new BridgeConceptsCommand(
            userId(principal),
            request.noteIds()
        ));

        return ApiSuccessResponse.ok(new BridgeConceptsData(
            result.recommendations().stream()
                .map(recommendation -> new BridgeConceptRecommendationData(
                    recommendation.noteId(),
                    recommendation.title(),
                    recommendation.bridgeReason()
                ))
                .toList()
        ));
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

    record LinkSuggestionsRequest(
        @NotBlank String noteId
    ) {
    }

    record LinkSuggestionsData(
        List<LinkSuggestionData> suggestions
    ) {
    }

    record LinkSuggestionData(
        String suggestionId,
        String targetNoteId,
        String targetTitle,
        double score,
        String reason,
        String anchorText,
        int anchorStartOffset,
        int anchorEndOffset
    ) {
    }

    record BridgeConceptsRequest(
        @NotEmpty @Size(min = 2, max = 10) List<@NotBlank String> noteIds
    ) {
    }

    record BridgeConceptsData(
        List<BridgeConceptRecommendationData> recommendations
    ) {
    }

    record BridgeConceptRecommendationData(
        String noteId,
        String title,
        String bridgeReason
    ) {
    }
}
