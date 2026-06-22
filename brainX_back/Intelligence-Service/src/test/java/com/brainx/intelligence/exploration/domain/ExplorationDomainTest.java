package com.brainx.intelligence.exploration.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ExplorationDomainTest {

    @Test
    void semanticSearchQueryRejectsBlankQuery() {
        assertThatThrownBy(() -> new SemanticSearchQuery("user-1", " ", Map.of(), 10, List.of()))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("query must not be blank");
    }

    @Test
    void semanticSearchQueryNormalizesLimit() {
        var defaulted = new SemanticSearchQuery("user-1", "rag", Map.of(), 0, List.of());
        var capped = new SemanticSearchQuery("user-1", "rag", Map.of(), 1000, List.of());

        assertThat(defaulted.limit()).isEqualTo(SemanticSearchQuery.DEFAULT_LIMIT);
        assertThat(capped.limit()).isEqualTo(SemanticSearchQuery.MAX_LIMIT);
    }

    @Test
    void semanticSearchResultsSortByScoreDescendingAndKeepsMatchedType() {
        var results = new SemanticSearchResults(List.of(
            new SemanticSearchResult("note-low", "Low", "", 0.25d, SearchMatchType.SEMANTIC),
            new SemanticSearchResult("note-high", "High", "", 0.95d, SearchMatchType.HYBRID)
        ), TokenChargeDecision.charged(12));

        assertThat(results.results())
            .extracting(SemanticSearchResult::noteId)
            .containsExactly("note-high", "note-low");
        assertThat(results.results().getFirst().matchedType()).isEqualTo(SearchMatchType.HYBRID);
        assertThat(results.tokenEstimate()).isEqualTo(12);
        assertThat(results.charged()).isTrue();
    }

    @Test
    void noteSummaryBuildsExcerptFallbackFromMarkdown() {
        var summary = NoteSummary.excerptFrom(
            "user-1",
            "note-1",
            "Fallback title",
            "# Heading\n\nThis is a markdown note with enough text."
        );

        assertThat(summary.source()).isEqualTo(SummarySource.EXCERPT);
        assertThat(summary.summary()).contains("Heading");
        assertThat(summary.summary()).doesNotContain("#");
    }
}
