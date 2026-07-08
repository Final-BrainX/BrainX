package com.brainx.intelligence.chat.adapter.web;

import java.util.List;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCommand;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesTokenUsageView;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@Validated
public class InternalRagAnswerController {

    private final AskNotesUseCase askNotesUseCase;

    public InternalRagAnswerController(AskNotesUseCase askNotesUseCase) {
        this.askNotesUseCase = askNotesUseCase;
    }

    @PostMapping("/internal/v1/intelligence/rag-answer")
    public ApiSuccessResponse<RagAnswerData> askNotes(
        @Valid @RequestBody InternalRagAnswerRequest request
    ) {
        var result = askNotesUseCase.askNotes(new AskNotesCommand(
            request.userId(),
            request.scope() == null || request.scope().isBlank() ? null : SearchScope.normalize(request.scope()),
            request.documentGroupId(),
            request.question(),
            request.limit(),
            request.modelId()
        ));
        return ApiSuccessResponse.ok(new RagAnswerData(
            result.answer(),
            result.citations().stream()
                .map(citation -> new RagAnswerCitationData(
                    citation.noteId(),
                    citation.title(),
                    citation.excerpt(),
                    citation.score(),
                    citation.matchedType()
                ))
                .toList(),
            result.modelId(),
            result.tokenEstimate(),
            result.charged(),
            result.tokenUsage()
        ));
    }

    record InternalRagAnswerRequest(
        @NotBlank String userId,
        String scope,
        String documentGroupId,
        @NotBlank String question,
        Integer limit,
        String modelId
    ) {
    }

    record RagAnswerData(
        String answer,
        List<RagAnswerCitationData> citations,
        String modelId,
        Integer tokenEstimate,
        boolean charged,
        AskNotesTokenUsageView tokenUsage
    ) {
    }

    record RagAnswerCitationData(
        String noteId,
        String title,
        String excerpt,
        double score,
        SearchMatchType matchedType
    ) {
    }
}
