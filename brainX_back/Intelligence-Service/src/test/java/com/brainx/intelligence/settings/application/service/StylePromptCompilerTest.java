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
                "speechLevel", "친근한 해요체",
                "directness", "high",
                "verbosity", "차갑고 짧게",
                "unknownKey", "ignore me",
                "assistanceStyle", "legacy"
            ),
            Map.of()
        );

        String instructions = compiler.conversationToneInstructions("user-1");

        assertThat(instructions)
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Use this speech level and sentence-ending style consistently: 친근한 해요체")
            .contains("Keep the directness level: high")
            .contains("Keep the response length/detail level: 차갑고 짧게")
            .contains("Do not mention the user's style profile")
            .doesNotContain("unknownKey")
            .doesNotContain("assistanceStyle");
    }

    @Test
    void writingStyleInstructionsCompileAllowedValuesAndAvoidList() {
        styleProfilePort.profile = profile(
            Map.of(),
            new LinkedHashMap<>(Map.of(
                "speechLevel", "음슴체",
                "formality", "담백한 업무 문체",
                "sentenceLength", "짧고 리듬감 있게",
                "avoid", List.of("emoji", "overpromising"),
                "nested", Map.of("ignored", true)
            ))
        );

        String instructions = compiler.writingStyleInstructions("user-1");

        assertThat(instructions)
            .contains("Mandatory user style instructions")
            .contains("every final generated or edited user-facing text segment")
            .contains("Use this speech level and sentence-ending style consistently: 음슴체")
            .contains("prefer terse eumsseum-style endings")
            .contains("\"함\", \"임\", \"됨\", \"있음\", and \"없음\"")
            .contains("Avoid polite/formal Korean endings")
            .contains("Use this formality/tone: 담백한 업무 문체")
            .contains("Use this sentence length/rhythm: 짧고 리듬감 있게")
            .contains("Avoid these expressions in the final output: emoji, overpromising")
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
