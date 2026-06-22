package com.brainx.intelligence.infrastructure.search;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

class OpenAiExternalSearchAdapterTest {

    private static final String API_KEY = "test-secret";

    @Test
    void searchCallsResponsesApiWithRequiredWebSearchAndNormalizesSourcesAndUsage() {
        Fixture fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + API_KEY))
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.model").value("gpt-test"))
            .andExpect(jsonPath("$.tools[0].type").value("web_search"))
            .andExpect(jsonPath("$.tools[0].filters.allowed_domains[0]").value("openai.com"))
            .andExpect(jsonPath("$.tool_choice").value("required"))
            .andExpect(jsonPath("$.include[0]").value("web_search_call.action.sources"))
            .andExpect(jsonPath("$.input").value("Responses web search?"))
            .andRespond(withSuccess("""
                {
                  "id": "resp-1",
                  "output_text": "Answer with citations.",
                  "usage": {
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "total_tokens": 120,
                    "input_tokens_details": {
                      "cached_tokens": 40
                    },
                    "output_tokens_details": {
                      "reasoning_tokens": 5
                    }
                  },
                  "output": [
                    {
                      "type": "web_search_call",
                      "action": {
                        "type": "search",
                        "sources": [
                          {
                            "title": "Full source",
                            "url": "https://example.com/full",
                            "snippet": "Full source snippet"
                          }
                        ]
                      }
                    },
                    {
                      "type": "message",
                      "content": [
                        {
                          "type": "output_text",
                          "text": "Answer with citations.",
                          "annotations": [
                            {
                              "type": "url_citation",
                              "start_index": 0,
                              "end_index": 6,
                              "title": "Cited source",
                              "url": "https://example.com/cited"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
                """, MediaType.APPLICATION_JSON));

        var response = fixture.adapter.search(new ExternalSearchRequest(
            "user-1",
            "Responses web search?",
            "gpt-test",
            8,
            List.of("https://openai.com/docs"),
            List.of()
        ));

        assertThat(response.answer()).isEqualTo("Answer with citations.");
        assertThat(response.provider()).isEqualTo("openai");
        assertThat(response.modelId()).isEqualTo("gpt-test");
        assertThat(response.responseId()).isEqualTo("resp-1");
        assertThat(response.sources()).hasSize(2);
        assertThat(response.sources().getFirst().title()).isEqualTo("Cited source");
        assertThat(response.sources().getFirst().url()).isEqualTo("https://example.com/cited");
        assertThat(response.sources().getFirst().snippet()).isEqualTo("Answer");
        assertThat(response.sources().get(1).title()).isEqualTo("Full source");
        assertThat(response.sources().get(1).snippet()).isEqualTo("Full source snippet");
        assertThat(response.tokenUsage().inputTokens()).isEqualTo(100);
        assertThat(response.tokenUsage().cachedInputTokens()).isEqualTo(40);
        assertThat(response.tokenUsage().billableInputTokens()).isEqualTo(60);
        assertThat(response.tokenUsage().outputTokens()).isEqualTo(20);
        assertThat(response.tokenUsage().reasoningTokens()).isEqualTo(5);
        assertThat(response.tokenUsage().totalTokens()).isEqualTo(120);
        assertThat(response.tokenUsage().costEstimate().totalCost()).isEqualByComparingTo("0.001280000000");

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
        fixture.server.verify();
    }

    @Test
    void responseTextFallsBackToMessageContentWhenOutputTextIsMissing() {
        Fixture fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
            .andRespond(withSuccess("""
                {
                  "id": "resp-2",
                  "output": [
                    {
                      "type": "message",
                      "content": [
                        {
                          "type": "output_text",
                          "text": "fallback answer"
                        }
                      ]
                    }
                  ]
                }
                """, MediaType.APPLICATION_JSON));

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
        fixture.server.verify();
    }

    @Test
    void errorsDoNotExposeApiKey() {
        Fixture fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
            .andRespond(withServerError());

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
        fixture.server.verify();
    }

    private static Fixture fixture() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
        var adapter = new OpenAiExternalSearchAdapter(
            builder.build(),
            properties(),
            tokenUsagePort,
            new AiTokenUsageCostEstimator(new FakeAiModelCatalog())
        );
        return new Fixture(adapter, server, tokenUsagePort);
    }

    private static ExternalSearchProperties properties() {
        ExternalSearchProperties properties = new ExternalSearchProperties();
        properties.setProvider("openai");
        properties.setMaxSources(8);
        properties.setTimeout(Duration.ofSeconds(20));
        ExternalSearchProperties.OpenAi openAi = new ExternalSearchProperties.OpenAi();
        openAi.setApiKey(API_KEY);
        openAi.setBaseUrl(URI.create("https://api.openai.test"));
        openAi.setModel("gpt-test");
        properties.setOpenai(openAi);
        return properties;
    }

    private record Fixture(
        OpenAiExternalSearchAdapter adapter,
        MockRestServiceServer server,
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
