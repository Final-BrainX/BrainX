package com.brainx.intelligence.chat.application.usecase;

import java.util.List;

import com.brainx.intelligence.chat.domain.ChatWebSource;

record WebSearchContext(
    boolean available,
    String query,
    String answer,
    List<ChatWebSource> sources,
    String provider,
    String modelId,
    String responseId
) {

    WebSearchContext {
        query = query == null ? "" : query.trim();
        answer = answer == null ? "" : answer.trim();
        sources = sources == null ? List.of() : List.copyOf(sources);
        provider = provider == null ? "" : provider.trim();
        modelId = modelId == null ? "" : modelId.trim();
        responseId = responseId == null || responseId.isBlank() ? null : responseId.trim();
    }

    static WebSearchContext none() {
        return new WebSearchContext(false, "", "", List.of(), "", "", null);
    }

    static WebSearchContext unavailable(String query) {
        return new WebSearchContext(false, query, "", List.of(), "", "", null);
    }
}
