package com.brainx.mcp.downstream;

import java.util.List;

public interface IntelligenceSearchGateway {

    SearchResponse search(String userId, SearchQuery query);

    AskNotesResponse askNotes(String userId, AskNotesQuery query);

    record SearchQuery(
        String query,
        Integer limit,
        String scope,
        String documentGroupId,
        String mode
    ) {
        public SearchQuery(
            String query,
            Integer limit,
            String scope,
            String documentGroupId
        ) {
            this(query, limit, scope, documentGroupId, null);
        }
    }

    record SearchResponse(
        List<SearchResult> results,
        Integer tokenEstimate,
        boolean charged
    ) {
    }

    record SearchResult(
        String noteId,
        String title,
        String excerpt,
        double score,
        String matchedType
    ) {
    }

    record AskNotesQuery(
        String question,
        Integer limit,
        String scope,
        String documentGroupId,
        String modelId
    ) {
    }

    record AskNotesResponse(
        String answer,
        List<AskNotesCitation> citations,
        String modelId,
        Integer tokenEstimate,
        boolean charged,
        AskNotesTokenUsage tokenUsage
    ) {
    }

    record AskNotesCitation(
        String noteId,
        String title,
        String excerpt,
        double score,
        String matchedType
    ) {
    }

    record AskNotesTokenUsage(
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens,
        Integer cachedPromptTokens,
        Integer reasoningTokens
    ) {
    }
}
