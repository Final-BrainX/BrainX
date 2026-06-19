package com.brainx.intelligence.exploration.application.port.inbound;

import java.util.List;
import java.util.Map;

import com.brainx.intelligence.exploration.domain.SearchMatchType;

public interface SemanticSearchUseCase {

    SemanticSearchResponse semanticSearch(SemanticSearchCommand command);

    record SemanticSearchCommand(
        String userId,
        String query,
        Map<String, Object> filters,
        Integer limit,
        List<String> hybridWithClientKeywordIds
    ) {
    }

    record SemanticSearchResponse(
        List<SearchResultView> results,
        Integer tokenEstimate,
        boolean charged
    ) {
    }

    record SearchResultView(
        String noteId,
        String title,
        String excerpt,
        double score,
        SearchMatchType matchedType
    ) {
    }
}
