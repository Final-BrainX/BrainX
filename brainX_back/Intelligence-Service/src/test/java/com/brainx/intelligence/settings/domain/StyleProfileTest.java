package com.brainx.intelligence.settings.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class StyleProfileTest {

    @Test
    void emptyProfileHasEmptyStyleSections() {
        StyleProfile profile = StyleProfile.empty("user-1");

        assertThat(profile.conversationToneValues()).isEmpty();
        assertThat(profile.writingStyleValues()).isEmpty();
        assertThat(profile.detectedFromNotesAt()).isNull();
    }

    @Test
    void styleSectionValueObjectsTreatNullAsEmpty() {
        assertThat(new ConversationTone(null).values()).isEmpty();
        assertThat(new WritingStyle(null).values()).isEmpty();
    }

    @Test
    void styleSectionValueObjectsDefensivelyCopyValues() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("directness", "high");

        ConversationTone conversationTone = new ConversationTone(values);
        values.put("directness", "low");

        assertThat(conversationTone.values()).containsEntry("directness", "high");
    }

    @Test
    void styleSectionValueObjectsExposeImmutableValues() {
        ConversationTone conversationTone = new ConversationTone(Map.of("speechLevel", "haeyo"));

        assertThatThrownBy(() -> conversationTone.values().put("speechLevel", "banmal"))
            .isInstanceOf(UnsupportedOperationException.class);
    }
}
