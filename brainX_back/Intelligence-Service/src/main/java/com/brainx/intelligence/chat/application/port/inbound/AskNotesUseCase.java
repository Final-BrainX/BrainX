package com.brainx.intelligence.chat.application.port.inbound;

import java.util.List;

import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;

public interface AskNotesUseCase {

    AskNotesResponse askNotes(AskNotesCommand command);

    record AskNotesCommand(
        String userId,
        SearchScope scope,
        String documentGroupId,
        String question,
        Integer limit,
        String modelId
    ) {
    }

    record AskNotesResponse(
        String answer,
        List<AskNotesCitationView> citations,
        String modelId,
        Integer tokenEstimate,
        boolean charged,
        AskNotesTokenUsageView tokenUsage
    ) {
    }

    record AskNotesCitationView(
        String noteId,
        String title,
        String excerpt,
        double score,
        SearchMatchType matchedType
    ) {
    }

    record AskNotesTokenUsageView(
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens,
        Integer cachedPromptTokens,
        Integer reasoningTokens
    ) {
    }
}
