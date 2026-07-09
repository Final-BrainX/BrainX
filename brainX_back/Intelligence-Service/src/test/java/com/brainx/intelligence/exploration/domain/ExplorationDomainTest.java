package com.brainx.intelligence.exploration.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ExplorationDomainTest {

    @Test
    void semanticSearchQueryRejectsBlankQuery() {
        assertThatThrownBy(() -> new SemanticSearchQuery("user-1", "group-1", " ", Map.of(), 10, List.of()))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("query must not be blank");
    }

    @Test
    void semanticSearchQueryNormalizesLimit() {
        var defaulted = new SemanticSearchQuery("user-1", "group-1", "rag", Map.of(), 0, List.of());
        var capped = new SemanticSearchQuery("user-1", "group-1", "rag", Map.of(), 1000, List.of());

        assertThat(defaulted.limit()).isEqualTo(SemanticSearchQuery.DEFAULT_LIMIT);
        assertThat(capped.limit()).isEqualTo(SemanticSearchQuery.MAX_LIMIT);
        assertThat(defaulted.searchMode()).isEqualTo(SearchMode.SEMANTIC);
    }

    @Test
    void semanticSearchQueryDocumentGroupScopeRequiresDocumentGroup() {
        assertThatThrownBy(() -> new SemanticSearchQuery("user-1", "rag", Map.of(), 10, List.of()))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("documentGroupId");
    }

    @Test
    void searchModeNormalizesCaseAndRejectsUnknownValues() {
        assertThat(SearchMode.normalize("keyword")).isEqualTo(SearchMode.KEYWORD);

        assertThatThrownBy(() -> SearchMode.normalize("unknown"))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("Unsupported search mode");
    }

    @Test
    void semanticSearchQueryUserScopeOmitsDocumentGroup() {
        var query = new SemanticSearchQuery("user-1", SearchScope.USER, null, "rag", Map.of(), 10, List.of());

        assertThat(query.scope()).isEqualTo(SearchScope.USER);
        assertThat(query.documentGroupId()).isNull();
    }

    @Test
    void semanticSearchQueryUserScopeRejectsDocumentGroup() {
        assertThatThrownBy(() -> new SemanticSearchQuery(
            "user-1",
            SearchScope.USER,
            "group-1",
            "rag",
            Map.of(),
            10,
            List.of()
        ))
            .isInstanceOf(ExplorationDomainException.class)
            .hasMessageContaining("documentGroupId");
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

    @Test
    void noteSummaryPreservesScopedIdentifiersVerbatim() {
        var generatedAt = Instant.parse("2026-07-09T03:00:00Z");
        var summary = NoteSummary.ai(
            "user-1",
            "dgrp_default_user_1",
            "note-1",
            "요약 본문",
            "sha_abc_def",
            "gpt-5.4-nano",
            generatedAt
        );

        assertThat(summary.documentGroupId()).isEqualTo("dgrp_default_user_1");
        assertThat(summary.markdownHash()).isEqualTo("sha_abc_def");
        assertThat(summary.modelId()).isEqualTo("gpt-5.4-nano");
        assertThat(summary.generatedAt()).isEqualTo(generatedAt);
    }
}
