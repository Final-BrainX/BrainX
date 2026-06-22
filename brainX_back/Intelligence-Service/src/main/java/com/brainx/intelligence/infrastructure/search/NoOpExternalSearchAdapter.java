package com.brainx.intelligence.infrastructure.search;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;

public class NoOpExternalSearchAdapter implements ExternalSearchPort {

    @Override
    public ExternalSearchResponse search(ExternalSearchRequest request) {
        String modelId = request == null || request.modelId() == null ? "" : request.modelId();
        return new ExternalSearchResponse(
            "External search provider is not configured.",
            null,
            "none",
            modelId,
            null,
            null
        );
    }
}
