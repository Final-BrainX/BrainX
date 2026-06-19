package com.brainx.intelligence.exploration.domain;

import java.util.Comparator;
import java.util.List;

public record SemanticSearchResults(
    List<SemanticSearchResult> results,
    TokenChargeDecision tokenChargeDecision
) {

    public SemanticSearchResults {
        results = results == null ? List.of() : results.stream()
            .sorted(Comparator.comparingDouble(SemanticSearchResult::score).reversed())
            .toList();
        tokenChargeDecision = tokenChargeDecision == null
            ? TokenChargeDecision.notCharged(null)
            : tokenChargeDecision;
    }

    public Integer tokenEstimate() {
        return tokenChargeDecision.tokenEstimate();
    }

    public boolean charged() {
        return tokenChargeDecision.charged();
    }
}
