package com.brainx.intelligence.infrastructure.dev.style;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Queue;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistCommand;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistResult;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class StyleProfileQualityApplicationRunnerTest {

    @Test
    void conversationScenarioStoresAllowedKeysAndReturnsPassedResponse() throws Exception {
        FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
        FakeAiChatPort aiChatPort = new FakeAiChatPort(
            "Short answer.",
            """
                {"scores":{"taskCompliance":5,"styleAdherence":5,"readability":5,"overUnderStyling":5,"safetyAndFormat":5},"passed":true,"rationale":"ok"}
                """
        );
        StyleProfileQualityApplicationRunner runner = runner(styleProfilePort, aiChatPort, new FakeInlineAssistUseCase());
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String input = """
            {"id":"tone","type":"conversation","conversationTone":{"directness":"핵심부터 말하기","emoji":"쓰지 않기","unknownKey":"ignore","assistanceStyle":"legacy"},"prompt":"Explain style settings.","answerMustContain":["Short"],"answerMustNotContain":["forbidden"]}
            exit
            """;

        runner.runQuality(
            new BufferedReader(new StringReader(input)),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("\"scenarioId\" : \"tone\"");
        assertThat(text).contains("\"status\" : \"passed\"");
        assertThat(text).contains("\"axis\" : \"conversationTone\"");
        assertThat(text).contains("Mandatory user style instructions");
        assertThat(text).contains("Keep the directness level: 핵심부터 말하기");
        assertThat(styleProfilePort.savedProfile.conversationToneValues())
            .containsEntry("directness", "핵심부터 말하기")
            .containsEntry("emoji", "쓰지 않기")
            .doesNotContainKeys("unknownKey", "assistanceStyle");
        assertThat(aiChatPort.requests).hasSize(2);
    }

    @Test
    void inlineAssistScenarioUsesWritingStyleAndUseCasePath() throws Exception {
        FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
        FakeInlineAssistUseCase useCase = new FakeInlineAssistUseCase();
        FakeAiChatPort aiChatPort = new FakeAiChatPort(
            """
                {"scores":{"taskCompliance":4,"styleAdherence":4,"readability":5,"overUnderStyling":4,"safetyAndFormat":5},"passed":true,"rationale":"ok"}
                """
        );
        StyleProfileQualityApplicationRunner runner = runner(styleProfilePort, aiChatPort, useCase);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String input = """
            {"id":"draft","type":"inline-assist","action":"DRAFT","writingStyle":{"speechLevel":"음슴체","formality":"담백한 업무 문체","sentenceLength":"짧게","unknownKey":"ignore"},"draftPrompt":"Write an update.","targetLength":120}
            exit
            """;

        runner.runQuality(
            new BufferedReader(new StringReader(input)),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("\"axis\" : \"writingStyle\"");
        assertThat(text).contains("\"feature\" : \"inline-assist-draft\"");
        assertThat(text).contains("\"status\" : \"passed\"");
        assertThat(text).contains("prefer terse eumsseum-style endings");
        assertThat(styleProfilePort.savedProfile.writingStyleValues())
            .containsEntry("speechLevel", "음슴체")
            .containsEntry("formality", "담백한 업무 문체")
            .containsEntry("sentenceLength", "짧게")
            .doesNotContainKey("unknownKey");
        assertThat(useCase.commands).hasSize(1);
        assertThat(useCase.commands.getFirst().action()).isEqualTo(InlineAssistAction.DRAFT);
    }

    @Test
    void invalidJudgeJsonFailsScenario() throws Exception {
        FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
        FakeAiChatPort aiChatPort = new FakeAiChatPort("Short answer.", "not json");
        StyleProfileQualityApplicationRunner runner = runner(styleProfilePort, aiChatPort, new FakeInlineAssistUseCase());
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String input = """
            {"id":"bad-judge","type":"conversation","conversationTone":{"directness":"high"},"prompt":"Explain style settings."}
            exit
            """;

        runner.runQuality(
            new BufferedReader(new StringReader(input)),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("\"status\" : \"failed\"");
        assertThat(text).contains("judge JSON parse failed");
    }

    @Test
    void unsupportedCommandFailsFast() {
        StyleProfileQualityDevProperties properties = properties();
        properties.setCommand("bad");
        StyleProfileQualityApplicationRunner runner = new StyleProfileQualityApplicationRunner(
            properties,
            new FakeStyleProfilePort(),
            new StylePromptCompiler(new FakeStyleProfilePort()),
            new FakeAiChatPort(),
            new FakeInlineAssistUseCase(),
            new ObjectMapper().findAndRegisterModules(),
            null
        );

        assertThatThrownBy(() -> runner.runQuality(
            new BufferedReader(new StringReader("")),
            new PrintStream(new ByteArrayOutputStream(), true, StandardCharsets.UTF_8)
        )).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unsupported style profile quality command");
    }

    private static StyleProfileQualityApplicationRunner runner(
        FakeStyleProfilePort styleProfilePort,
        FakeAiChatPort aiChatPort,
        CreateInlineAssistUseCase inlineAssistUseCase
    ) {
        return new StyleProfileQualityApplicationRunner(
            properties(),
            styleProfilePort,
            new StylePromptCompiler(styleProfilePort),
            aiChatPort,
            inlineAssistUseCase,
            new ObjectMapper().findAndRegisterModules(),
            null
        );
    }

    private static StyleProfileQualityDevProperties properties() {
        StyleProfileQualityDevProperties properties = new StyleProfileQualityDevProperties();
        properties.setUserId("user-1");
        properties.setNoteId("note-1");
        properties.setModelId("gpt-test");
        properties.setJudgeModelId("gpt-judge");
        return properties;
    }

    private static final class FakeStyleProfilePort implements StyleProfilePort {

        private StyleProfile savedProfile;

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            savedProfile = styleProfile;
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return Optional.ofNullable(savedProfile)
                .filter(profile -> profile.userId().equals(userId));
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private final Queue<String> responses = new ArrayDeque<>();
        private final List<AiChatRequest> requests = new ArrayList<>();

        private FakeAiChatPort(String... responses) {
            this.responses.addAll(List.of(responses));
        }

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            requests.add(request);
            String content = responses.isEmpty() ? "{}" : responses.remove();
            return new AiChatResponse(content, new AiTokenUsage(1, 2, 3));
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static final class FakeInlineAssistUseCase implements CreateInlineAssistUseCase {

        private final List<InlineAssistCommand> commands = new ArrayList<>();

        @Override
        public InlineAssistResult createInlineAssist(InlineAssistCommand command) {
            commands.add(command);
            return new InlineAssistResult(
                "suggestion-1",
                command.action(),
                "gpt-inline",
                "Business update."
            );
        }
    }
}
