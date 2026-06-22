package com.brainx.intelligence.infrastructure.dev.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchResponse;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;
import com.fasterxml.jackson.databind.ObjectMapper;

class ExternalSearchApplicationRunnerTest {

    @Test
    void singleQueryWritesJsonResponse() throws Exception {
        ExternalSearchDevProperties properties = properties();
        properties.setQuery("OpenAI web search?");
        FakeExternalSearchPort searchPort = new FakeExternalSearchPort();
        ExternalSearchApplicationRunner runner = runner(properties, searchPort);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        runner.runSearch(
            new BufferedReader(new StringReader("")),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String json = output.toString(StandardCharsets.UTF_8);
        assertThat(json).contains("\"query\" : \"OpenAI web search?\"");
        assertThat(json).contains("\"answer\" : \"answer for OpenAI web search?\"");
        assertThat(json).contains("\"provider\" : \"fake\"");
        assertThat(searchPort.requests).hasSize(1);
        assertThat(searchPort.requests.getFirst().userId()).isEqualTo("user-1");
        assertThat(searchPort.requests.getFirst().modelId()).isEqualTo("gpt-test");
        assertThat(searchPort.requests.getFirst().maxSources()).isEqualTo(3);
        assertThat(searchPort.requests.getFirst().allowedDomains()).containsExactly("openai.com");
    }

    @Test
    void stdinLoopHandlesMultipleQueriesUntilExit() throws Exception {
        ExternalSearchDevProperties properties = properties();
        properties.setQuery("");
        FakeExternalSearchPort searchPort = new FakeExternalSearchPort();
        ExternalSearchApplicationRunner runner = runner(properties, searchPort);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        runner.runSearch(
            new BufferedReader(new StringReader("first\n\nsecond\nexit\n")),
            new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        String text = output.toString(StandardCharsets.UTF_8);
        assertThat(text).contains("brainx-search> ");
        assertThat(text).contains("\"query\" : \"first\"");
        assertThat(text).contains("\"query\" : \"second\"");
        assertThat(searchPort.requests).extracting(ExternalSearchRequest::query)
            .containsExactly("first", "second");
    }

    private static ExternalSearchApplicationRunner runner(
        ExternalSearchDevProperties properties,
        ExternalSearchPort searchPort
    ) {
        return new ExternalSearchApplicationRunner(
            properties,
            searchPort,
            new ObjectMapper().findAndRegisterModules(),
            null
        );
    }

    private static ExternalSearchDevProperties properties() {
        ExternalSearchDevProperties properties = new ExternalSearchDevProperties();
        properties.setUserId("user-1");
        properties.setModelId("gpt-test");
        properties.setMaxSources(3);
        properties.setAllowedDomains(List.of("openai.com"));
        return properties;
    }

    private static final class FakeExternalSearchPort implements ExternalSearchPort {

        private final List<ExternalSearchRequest> requests = new ArrayList<>();

        @Override
        public ExternalSearchResponse search(ExternalSearchRequest request) {
            requests.add(request);
            return new ExternalSearchResponse(
                "answer for " + request.query(),
                List.of(new ExternalSearchSource("source", "https://example.com", "snippet", 1)),
                "fake",
                request.modelId(),
                "resp-" + requests.size(),
                null
            );
        }
    }
}
