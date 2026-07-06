package com.brainx.intelligence.infrastructure.dev.connection;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptRecommendation;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsResult;
import com.brainx.intelligence.infrastructure.dev.rag.SampleRagProperties;
import com.fasterxml.jackson.databind.ObjectMapper;

class ConnectionQualityApplicationRunnerTest {

    @Test
    void sampleNoteIdMatchesSampleLoaderRule() {
        assertThat(ConnectionQualityApplicationRunner.sampleNoteId("기능.md"))
            .startsWith("sample-")
            .hasSize("sample-".length() + 16);
        assertThat(ConnectionQualityApplicationRunner.sampleNoteId("folder\\note.md"))
            .isEqualTo(ConnectionQualityApplicationRunner.sampleNoteId("folder/note.md"));
    }

    @Test
    void stdinJsonlRunsLinkAndBridgeScenarios() throws Exception {
        ConnectionQualityDevProperties properties = properties();
        FakeLinkUseCase link = new FakeLinkUseCase();
        FakeBridgeUseCase bridge = new FakeBridgeUseCase();
        ConnectionQualityApplicationRunner runner = runner(properties, link, bridge);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String input = """
            {"id":"link","type":"link-suggestions","sourcePath":"기능.md","minSuggestionCount":1,"minScore":0.7,"requireReason":true}
            {"id":"bridge","type":"bridge-concepts","notePaths":["기능.md","핵심.md"],"minRecommendationCount":1,"requireReason":true,"requiredBridgeWikiLinks":["[[기능]]","[[핵심]]"]}
            exit
            """;

        runner.runQuality(
            new BufferedReader(new StringReader(input)),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("\"scenarioId\" : \"link\"");
        assertThat(text).contains("\"scenarioId\" : \"bridge\"");
        assertThat(text).contains("\"status\" : \"passed\"");
        assertThat(link.commands).hasSize(1);
        assertThat(link.commands.getFirst().noteId()).isEqualTo(ConnectionQualityApplicationRunner.sampleNoteId("기능.md"));
        assertThat(bridge.commands).hasSize(1);
        assertThat(bridge.commands.getFirst().noteIds()).containsExactly(
            ConnectionQualityApplicationRunner.sampleNoteId("기능.md"),
            ConnectionQualityApplicationRunner.sampleNoteId("핵심.md")
        );
    }

    @Test
    void bridgeScenarioFailsWhenRequiredWikiLinksAreMissing() throws Exception {
        ConnectionQualityDevProperties properties = properties();
        FakeBridgeUseCase bridge = new FakeBridgeUseCase();
        bridge.reason = "두 노트를 이어 주는 이유";
        ConnectionQualityApplicationRunner runner = runner(properties, new FakeLinkUseCase(), bridge);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        String input = """
            {"id":"bridge","type":"bridge-concepts","notePaths":["기능.md","핵심.md"],"minRecommendationCount":1,"requireReason":true,"requiredBridgeWikiLinks":["[[기능]]","[[핵심]]"]}
            exit
            """;

        runner.runQuality(
            new BufferedReader(new StringReader(input)),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("\"status\" : \"failed\"");
        assertThat(text).contains("missing bridge wiki link [[기능]]");
    }

    private static ConnectionQualityApplicationRunner runner(
        ConnectionQualityDevProperties properties,
        CreateLinkSuggestionsUseCase link,
        CreateBridgeConceptsUseCase bridge
    ) {
        return new ConnectionQualityApplicationRunner(
            properties,
            new SampleRagProperties(),
            null,
            link,
            bridge,
            new ObjectMapper().findAndRegisterModules(),
            null
        );
    }

    private static ConnectionQualityDevProperties properties() {
        ConnectionQualityDevProperties properties = new ConnectionQualityDevProperties();
        properties.setUserId("user-1");
        return properties;
    }

    private static final class FakeLinkUseCase implements CreateLinkSuggestionsUseCase {

        private final List<LinkSuggestionsCommand> commands = new ArrayList<>();

        @Override
        public LinkSuggestionsResult createLinkSuggestions(LinkSuggestionsCommand command) {
            commands.add(command);
            return new LinkSuggestionsResult(List.of(new LinkSuggestionResult(
                "suggestion-1",
                "target-1",
                "Target",
                0.91d,
                "관련 이유",
                "Anchor",
                0,
                6
            )));
        }
    }

    private static final class FakeBridgeUseCase implements CreateBridgeConceptsUseCase {

        private final List<BridgeConceptsCommand> commands = new ArrayList<>();
        private String reason = "[[기능]]과 [[핵심]]을 이어 주는 이유";

        @Override
        public BridgeConceptsResult createBridgeConcepts(BridgeConceptsCommand command) {
            commands.add(command);
            return new BridgeConceptsResult(List.of(new BridgeConceptRecommendation(
                "bridge-1",
                "연결 주제",
                reason
            )));
        }
    }
}
