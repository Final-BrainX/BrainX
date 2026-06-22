package com.brainx.intelligence.infrastructure.ai.voyage;

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

import java.net.URI;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.InputType;

class VoyageEmbeddingAdapterTest {

    private static final String API_KEY = "test-secret";

    @Test
    void documentEmbeddingUsesDocumentInputTypeAndReturnsUsage() {
        var fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.voyageai.test/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + API_KEY))
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.input[0]").value("document text"))
            .andExpect(jsonPath("$.model").value("voyage-4-lite"))
            .andExpect(jsonPath("$.input_type").value("document"))
            .andExpect(jsonPath("$.output_dimension").value(1024))
            .andExpect(jsonPath("$.output_dtype").value("float"))
            .andRespond(withSuccess("""
                {
                  "data": [
                    {"embedding": [0.1, 0.2], "index": 0}
                  ],
                  "usage": {"total_tokens": 3}
                }
                """, MediaType.APPLICATION_JSON));

        var response = fixture.adapter.embed(new AiEmbeddingRequest(
            null,
            List.of("document text"),
            InputType.DOCUMENT
        ));

        assertThat(response.modelId()).isEqualTo("voyage-4-lite");
        assertThat(response.totalTokens()).isEqualTo(3);
        assertThat(response.vectors()).hasSize(1);
        assertThat(response.vectors().getFirst().text()).isEqualTo("document text");
        assertThat(response.vectors().getFirst().values()).containsExactly(0.1d, 0.2d);
        fixture.server.verify();
    }

    @Test
    void queryEmbeddingUsesQueryInputType() {
        var fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.voyageai.test/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(jsonPath("$.input[0]").value("semantic query"))
            .andExpect(jsonPath("$.input_type").value("query"))
            .andRespond(withSuccess("""
                {
                  "data": [
                    {"embedding": [0.3, 0.4], "index": 0}
                  ]
                }
                """, MediaType.APPLICATION_JSON));

        var response = fixture.adapter.embed(new AiEmbeddingRequest(
            null,
            List.of("semantic query"),
            InputType.QUERY
        ));

        assertThat(response.totalTokens()).isNull();
        assertThat(response.vectors().getFirst().values()).containsExactly(0.3d, 0.4d);
        fixture.server.verify();
    }

    @Test
    void responseEmbeddingsAreMappedByIndexOrder() {
        var fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.voyageai.test/v1/embeddings"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(jsonPath("$.input[0]").value("first"))
            .andExpect(jsonPath("$.input[1]").value("second"))
            .andRespond(withSuccess("""
                {
                  "data": [
                    {"embedding": [3.0, 4.0], "index": 1},
                    {"embedding": [1.0, 2.0], "index": 0}
                  ],
                  "usage": {"total_tokens": 5}
                }
                """, MediaType.APPLICATION_JSON));

        var response = fixture.adapter.embed(new AiEmbeddingRequest(
            "voyage-4",
            List.of("first", "second"),
            InputType.UNSPECIFIED
        ));

        assertThat(response.modelId()).isEqualTo("voyage-4");
        assertThat(response.totalTokens()).isEqualTo(5);
        assertThat(response.vectors()).hasSize(2);
        assertThat(response.vectors().getFirst().values()).containsExactly(1.0d, 2.0d);
        assertThat(response.vectors().get(1).values()).containsExactly(3.0d, 4.0d);
        fixture.server.verify();
    }

    @Test
    void errorsDoNotExposeApiKey() {
        var fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.voyageai.test/v1/embeddings"))
            .andRespond(withServerError());

        assertThatThrownBy(() -> fixture.adapter.embed(new AiEmbeddingRequest(
            null,
            List.of("semantic query"),
            InputType.QUERY
        )))
            .isInstanceOf(VoyageEmbeddingException.class)
            .hasMessageContaining("status 500")
            .hasMessageNotContaining(API_KEY);
        fixture.server.verify();
    }

    private static Fixture fixture() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.voyageai.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(new VoyageEmbeddingAdapter(builder.build(), properties()), server);
    }

    private static VoyageEmbeddingProperties.Voyage properties() {
        var voyage = new VoyageEmbeddingProperties.Voyage();
        voyage.setApiKey(API_KEY);
        voyage.setBaseUrl(URI.create("https://api.voyageai.test"));
        voyage.setModel("voyage-4-lite");
        voyage.setDimensions(1024);
        voyage.setTruncation(true);
        voyage.setTimeout(Duration.ofSeconds(10));
        return voyage;
    }

    private record Fixture(
        VoyageEmbeddingAdapter adapter,
        MockRestServiceServer server
    ) {
    }
}
