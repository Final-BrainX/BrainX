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
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.EmbeddingOptions;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class VoyageEmbeddingModelTest {

    private static final String API_KEY = "test-secret";

    @Test
    void documentEmbeddingUsesDocumentInputType() {
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

        List<float[]> embeddings = fixture.model.embed(
            List.of(Document.builder().text("document text").build()),
            EmbeddingOptions.builder().build(),
            List::of
        );

        assertThat(embeddings).hasSize(1);
        assertThat(embeddings.getFirst()).containsExactly(0.1f, 0.2f);
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

        float[] embedding = fixture.model.embed("semantic query");

        assertThat(embedding).containsExactly(0.3f, 0.4f);
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
                  ]
                }
                """, MediaType.APPLICATION_JSON));

        var response = fixture.model.embedForResponse(List.of("first", "second"));

        assertThat(response.getResults()).hasSize(2);
        assertThat(response.getResults().getFirst().getOutput()).containsExactly(1.0f, 2.0f);
        assertThat(response.getResults().get(1).getOutput()).containsExactly(3.0f, 4.0f);
        fixture.server.verify();
    }

    @Test
    void errorsDoNotExposeApiKey() {
        var fixture = fixture();
        fixture.server.expect(once(), requestTo("https://api.voyageai.test/v1/embeddings"))
            .andRespond(withServerError());

        assertThatThrownBy(() -> fixture.model.embed("semantic query"))
            .isInstanceOf(VoyageEmbeddingException.class)
            .hasMessageContaining("status 500")
            .hasMessageNotContaining(API_KEY);
        fixture.server.verify();
    }

    private static Fixture fixture() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.voyageai.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(new VoyageEmbeddingModel(builder.build(), properties()), server);
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
        VoyageEmbeddingModel model,
        MockRestServiceServer server
    ) {
    }
}
