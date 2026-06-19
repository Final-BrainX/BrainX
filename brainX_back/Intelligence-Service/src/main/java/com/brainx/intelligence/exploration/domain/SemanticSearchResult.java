package com.brainx.intelligence.exploration.domain;

public record SemanticSearchResult(
    String noteId,
    String title,
    String excerpt,
    double score,
    SearchMatchType matchedType
) {

    public SemanticSearchResult {
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        title = ExplorationValidation.requireText(title, "title");
        excerpt = excerpt == null ? "" : excerpt;
        if (Double.isNaN(score) || Double.isInfinite(score)) {
            throw new ExplorationDomainException("score must be a finite number.");
        }
        matchedType = matchedType == null ? SearchMatchType.SEMANTIC : matchedType;
    }
}
