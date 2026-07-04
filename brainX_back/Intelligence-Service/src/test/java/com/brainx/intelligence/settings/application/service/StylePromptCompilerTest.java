package com.brainx.intelligence.settings.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;

class StylePromptCompilerTest {

    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler compiler = new StylePromptCompiler(styleProfilePort);

    @Test
    void conversationToneInstructionsIncludeOnlyAllowedKeys() {
        styleProfilePort.profile = profile(
            Map.of(
                "directness", "high",
                "verbosity", "concise",
                "unknownKey", "ignore me",
                "assistanceStyle", "legacy"
            ),
            Map.of()
        );

        String instructions = compiler.conversationToneInstructions("user-1");

        assertThat(instructions)
            .contains("User conversation tone profile")
            .contains("- directness: high")
            .contains("- verbosity: concise")
            .doesNotContain("unknownKey")
            .doesNotContain("assistanceStyle");
    }

    @Test
    void writingStyleInstructionsCompileAllowedValuesAndAvoidList() {
        styleProfilePort.profile = profile(
            Map.of(),
            new LinkedHashMap<>(Map.of(
                "formality", "business",
                "sentenceLength", "short",
                "avoid", List.of("emoji", "overpromising"),
                "nested", Map.of("ignored", true)
            ))
        );

        String instructions = compiler.writingStyleInstructions("user-1");

        assertThat(instructions)
            .contains("User writing style profile")
            .contains("- formality: business")
            .contains("- sentenceLength: short")
            .contains("- avoid: emoji, overpromising")
            .doesNotContain("nested");
    }

    @Test
    void emptyProfileIsNoOp() {
        styleProfilePort.profile = StyleProfile.empty("user-1");

        assertThat(compiler.conversationToneInstructions("user-1")).isEmpty();
        assertThat(compiler.writingStyleInstructions("user-1")).isEmpty();
        assertThat(StylePromptCompiler.appendToSystemPrompt("base", "")).isEqualTo("base");
    }

    private static StyleProfile profile(Map<String, Object> conversationTone, Map<String, Object> writingStyle) {
        return new StyleProfile(
            "user-1",
            new ConversationTone(conversationTone),
            new WritingStyle(writingStyle),
            null
        );
    }

    private static final class FakeStyleProfilePort implements StyleProfilePort {

        private StyleProfile profile;

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            profile = styleProfile;
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return Optional.ofNullable(profile)
                .filter(item -> item.userId().equals(userId));
        }
    }
}
