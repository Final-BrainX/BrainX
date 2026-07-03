package com.brainx.mcp.downstream;

import java.util.List;

public interface IntelligenceSearchGateway {

    SearchResponse search(String userId, SearchQuery query);

    record SearchQuery(
        String query,
        Integer limit,
        String scope,
        String documentGroupId
    ) {
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
}
