package com.brainx.commerce.service;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class TokenUsageFeatureLabelsTest {

    @Test
    void mapsKnownFeatureIdsToUiCategories() {
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("inline-assist-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AI_WRITING_ASSIST);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("insight-report-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AUTO_SUMMARY);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("rag-chat"))
                .isEqualTo(TokenUsageFeatureLabels.SEMANTIC_SEARCH);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("bridge-concepts"))
                .isEqualTo(TokenUsageFeatureLabels.AUTO_TAG_ORGANIZATION);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("link-suggestions"))
                .isEqualTo(TokenUsageFeatureLabels.AUTO_TAG_ORGANIZATION);
    }

    @Test
    void unmappedFeatureIdFallsBackToOther() {
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("chat-router-classifier"))
                .isEqualTo(TokenUsageFeatureLabels.OTHER);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("some-future-feature"))
                .isEqualTo(TokenUsageFeatureLabels.OTHER);
    }
}
