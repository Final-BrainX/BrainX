package com.brainx.intelligence.infrastructure.search;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchStreamEvent;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

import reactor.core.publisher.Mono;

class OpenAiExternalSearchAdapterTest {

    private static final String API_KEY = "test-secret";

    @Test
    void requestBodyUsesStreamingRequiredWebSearchWithLowContext() {
        Map<String, Object> body = new OpenAiExternalSearchRequestFactory().requestBody(new ExternalSearchRequest(
            "user-1",
            "Responses web search?",
            "gpt-test",
            8,
            List.of("https://openai.com/docs"),
            List.of()
        ), "gpt-test", "low");

        assertThat(body)
            .containsEntry("model", "gpt-test")
            .containsEntry("tool_choice", "required")
            .containsEntry("input", "Responses web search?")
            .containsEntry("stream", true);
        assertThat(body.get("include")).isEqualTo(List.of("web_search_call.action.sources"));
        @SuppressWarnings("unchecked")
        Map<String, Object> tool = ((List<Map<String, Object>>) body.get("tools")).getFirst();
        assertThat(tool)
            .containsEntry("type", "web_search")
            .containsEntry("search_context_size", "low");
        @SuppressWarnings("unchecked")
        Map<String, Object> filters = (Map<String, Object>) tool.get("filters");
        assertThat(filters.get("allowed_domains")).isEqualTo(List.of("openai.com"));
    }

    @Test
    void searchContextSizeFallsBackToLowForBlankOrUnknownValues() {
        ExternalSearchProperties properties = new ExternalSearchProperties();

        properties.setSearchContextSize("high");
        assertThat(properties.getSearchContextSize()).isEqualTo("high");

        properties.setSearchContextSize("  ");
        assertThat(properties.getSearchContextSize()).isEqualTo("low");

        properties.setSearchContextSize("fast");
        assertThat(properties.getSearchContextSize()).isEqualTo("low");
    }

    @Test
    void searchStreamsResponsesApiAndNormalizesSourcesAndUsage() {
        Fixture fixture = fixture(successStream("""
            event: response.created
            data: {"type":"response.created"}

            event: response.output_item.added
            data: {"type":"response.output_item.added","item":{"type":"web_search_call","status":"in_progress","action":{"type":"search","query":"Responses web search?"}}}

            event: response.output_item.done
            data: {"type":"response.output_item.done","item":{"type":"web_search_call","status":"completed","action":{"type":"search","query":"Responses web search?","sources":[{"title":"Full source","url":"https://example.com/full","snippet":"Full source snippet"}]}}}

            event: response.completed
            data: {"type":"response.completed","response":{"id":"resp-1","output_text":"Answer with citations.","usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120,"input_tokens_details":{"cached_tokens":40},"output_tokens_details":{"reasoning_tokens":5}},"output":[{"type":"message","content":[{"type":"output_text","text":"Answer with citations.","annotations":[{"type":"url_citation","start_index":0,"end_index":6,"title":"Cited source","url":"https://example.com/cited"}]}]}]}}

            """), HttpStatus.OK);

        List<ExternalSearchStreamEvent> events = fixture.adapter.searchStream(new ExternalSearchRequest(
            "user-1",
            "Responses web search?",
            "gpt-test",
            8,
            List.of(),
            List.of()
        )).collectList().block();

        assertThat(fixture.lastRequest.get().method()).isEqualTo(HttpMethod.POST);
        assertThat(fixture.lastRequest.get().url().toString()).isEqualTo("https://api.openai.test/v1/responses");
        assertThat(fixture.lastRequest.get().headers().getFirst(HttpHeaders.AUTHORIZATION))
            .isEqualTo("Bearer " + API_KEY);
        assertThat(events).isNotNull();
        assertThat(events.stream().filter(ExternalSearchStreamEvent::progressEvent)).hasSize(3);
        assertThat(events.stream().filter(ExternalSearchStreamEvent::sourcesEvent).findFirst())
            .hasValueSatisfying(event -> assertThat(event.sources()).hasSize(1));
        var completed = events.stream()
            .filter(ExternalSearchStreamEvent::completedEvent)
            .findFirst()
            .orElseThrow()
            .response();
        assertThat(completed.answer()).isEqualTo("Answer with citations.");
        assertThat(completed.provider()).isEqualTo("openai");
        assertThat(completed.modelId()).isEqualTo("gpt-test");
        assertThat(completed.responseId()).isEqualTo("resp-1");
        assertThat(completed.sources()).hasSize(2);
        assertThat(completed.sources().getFirst().title()).isEqualTo("Full source");
        assertThat(completed.sources().get(1).title()).isEqualTo("Cited source");
        assertThat(completed.tokenUsage().inputTokens()).isEqualTo(100);
        assertThat(completed.tokenUsage().cachedInputTokens()).isEqualTo(40);
        assertThat(completed.tokenUsage().billableInputTokens()).isEqualTo(60);
        assertThat(completed.tokenUsage().outputTokens()).isEqualTo(20);
        assertThat(completed.tokenUsage().reasoningTokens()).isEqualTo(5);
        assertThat(completed.tokenUsage().totalTokens()).isEqualTo(120);
        assertThat(completed.tokenUsage().costEstimate().totalCost()).isEqualByComparingTo("0.001280000000");

        assertThat(fixture.tokenUsagePort.records).hasSize(1);
        TokenUsageRecord usage = fixture.tokenUsagePort.records.getFirst();
        assertThat(usage.featureId()).isEqualTo("external-search-web");
        assertThat(usage.modelId()).isEqualTo("gpt-test");
        assertThat(usage.inputTokens()).isEqualTo(100);
        assertThat(usage.cachedInputTokens()).isEqualTo(40);
        assertThat(usage.billableInputTokens()).isEqualTo(60);
        assertThat(usage.outputTokens()).isEqualTo(20);
        assertThat(usage.reasoningTokens()).isEqualTo(5);
        assertThat(usage.estimatedCost()).isEqualByComparingTo("0.001280000000");
        assertThat(usage.costCurrency()).isEqualTo("USD");
        assertThat(usage.causationId()).isEqualTo("resp-1");
    }

    @Test
    void responseTextFallsBackToMessageContentWhenOutputTextIsMissing() {
        Fixture fixture = fixture(successStream("""
            event: response.completed
            data: {"type":"response.completed","response":{"id":"resp-2","output":[{"type":"message","content":[{"type":"output_text","text":"fallback answer"}]}]}}

            """), HttpStatus.OK);

        var response = fixture.adapter.search(new ExternalSearchRequest(
            "user-1",
            "fallback?",
            null,
            0,
            List.of(),
            List.of()
        ));

        assertThat(response.answer()).isEqualTo("fallback answer");
        assertThat(response.modelId()).isEqualTo("gpt-test");
        assertThat(response.tokenUsage()).isNull();
        assertThat(fixture.tokenUsagePort.records).isEmpty();
    }

    @Test
    void errorsDoNotExposeApiKey() {
        Fixture fixture = fixture("server error", HttpStatus.INTERNAL_SERVER_ERROR);

        assertThatThrownBy(() -> fixture.adapter.search(new ExternalSearchRequest(
            "user-1",
            "fail?",
            null,
            0,
            List.of(),
            List.of()
        )))
            .isInstanceOf(OpenAiExternalSearchException.class)
            .hasMessageContaining("status 500")
            .hasMessageNotContaining(API_KEY);
    }

    private static String successStream(String body) {
        return body.replace("\r\n", "\n");
    }

    private static Fixture fixture(String responseBody, HttpStatus status) {
        FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
        AtomicReference<ClientRequest> lastRequest = new AtomicReference<>();
        WebClient webClient = WebClient.builder()
            .baseUrl("https://api.openai.test")
            .exchangeFunction(request -> {
                lastRequest.set(request);
                ClientResponse response = ClientResponse.create(status)
                    .header(
                        HttpHeaders.CONTENT_TYPE,
                        status.is2xxSuccessful() ? MediaType.TEXT_EVENT_STREAM_VALUE : MediaType.TEXT_PLAIN_VALUE
                    )
                    .body(responseBody)
                    .build();
                return Mono.just(response);
            })
            .build();
        var adapter = new OpenAiExternalSearchAdapter(
            webClient,
            properties(),
            new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new FakeAiModelCatalog())),
            new AiTokenUsageCostEstimator(new FakeAiModelCatalog())
        );
        return new Fixture(adapter, lastRequest, tokenUsagePort);
    }

    private static ExternalSearchProperties properties() {
        ExternalSearchProperties properties = new ExternalSearchProperties();
        properties.setProvider("openai");
        properties.setMaxSources(8);
        properties.setTimeout(Duration.ofSeconds(20));
        properties.setSearchContextSize("low");
        ExternalSearchProperties.OpenAi openAi = new ExternalSearchProperties.OpenAi();
        openAi.setApiKey(API_KEY);
        openAi.setBaseUrl(URI.create("https://api.openai.test"));
        openAi.setModel("gpt-test");
        properties.setOpenai(openAi);
        return properties;
    }

    private record Fixture(
        OpenAiExternalSearchAdapter adapter,
        AtomicReference<ClientRequest> lastRequest,
        FakeTokenUsagePort tokenUsagePort
    ) {
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalog implements AiModelCatalogPort {

        private static final AiModel MODEL = new AiModel(
            "gpt-test",
            "GPT test",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.010000"),
                new BigDecimal("0.002000"),
                new BigDecimal("0.030000"),
                "USD"
            )
        );

        @Override
        public List<AiModel> findAll() {
            return List.of(MODEL);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return MODEL.modelId().equals(modelId) ? Optional.of(MODEL) : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return MODEL.modelId().equals(modelId);
        }
    }
}
