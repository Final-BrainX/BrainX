package com.brainx.commerce.service;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class TokenUsageFeatureLabelsTest {

    @Test
    void mapsKnownFeatureIdsToUiCategories() {
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("inline-assist-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AI_WRITING_ASSIST);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("insight-report-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AI_CHATBOT);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("note-summary-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AUTO_SUMMARY);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("rag-chat"))
                .isEqualTo(TokenUsageFeatureLabels.AI_CHATBOT);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("chat-router-classifier"))
                .isEqualTo(TokenUsageFeatureLabels.AI_CHATBOT);
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("bridge-concepts"))
                .isEqualTo(TokenUsageFeatureLabels.AUTO_TAG_ORGANIZATION);
    }

    @Test
    void unmappedFeatureIdFallsBackToOther() {
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("some-future-feature"))
                .isEqualTo(TokenUsageFeatureLabels.OTHER);
    }

    @Test
    void linkSuggestionsIsIntentionallyUnmappedBecauseItNeverCarriesTokenUsage() {
        // link-suggestions는 ConnectionService의 LinkSuggestionCreatedEvent 필드로만 쓰이고,
        // 실제 토큰 사용량은 내부적으로 note-auto-link-vector-refine-chat으로 기록되므로
        // 이 featureId로 recordTokenUsage가 호출되는 일이 없다. 매핑을 추가하지 않는다.
        Assertions.assertThat(TokenUsageFeatureLabels.labelFor("link-suggestions"))
                .isEqualTo(TokenUsageFeatureLabels.OTHER);
    }
}
