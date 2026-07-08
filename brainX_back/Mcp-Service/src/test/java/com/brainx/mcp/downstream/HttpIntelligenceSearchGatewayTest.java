package com.brainx.mcp.downstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class HttpIntelligenceSearchGatewayTest {

    @Test
    void searchPostsSearchModeToInternalSemanticSearch() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://intelligence");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpIntelligenceSearchGateway gateway = new HttpIntelligenceSearchGateway(
            builder.build(),
            serviceProperties()
        );

        server.expect(once(), requestTo("http://intelligence/internal/v1/intelligence/semantic-search"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Service-Token", "service-token"))
            .andExpect(content().json("""
                {
                  "userId": "usr_1",
                  "scope": "USER",
                  "documentGroupId": null,
                  "query": "rag",
                  "filters": {},
                  "limit": 3,
                  "hybridWithClientKeywordIds": [],
                  "searchMode": "KEYWORD"
                }
                """))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "data": {
                    "results": [
                      {
                        "noteId": "note-1",
                        "title": "RAG",
                        "excerpt": "keyword match",
                        "score": 0.8,
                        "matchedType": "KEYWORD"
                      }
                    ],
                    "tokenEstimate": 0,
                    "charged": false
                  },
                  "message": "ok"
                }
                """, MediaType.APPLICATION_JSON));

        var response = gateway.search("usr_1", new IntelligenceSearchGateway.SearchQuery(
            "rag",
            3,
            "USER",
            null,
            "KEYWORD"
        ));

        assertThat(response.results()).hasSize(1);
        assertThat(response.results().getFirst().matchedType()).isEqualTo("KEYWORD");
        assertThat(response.charged()).isFalse();
        server.verify();
    }

    @Test
    void askNotesPostsToInternalRagAnswer() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://intelligence");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpIntelligenceSearchGateway gateway = new HttpIntelligenceSearchGateway(
            builder.build(),
            serviceProperties()
        );

        server.expect(once(), requestTo("http://intelligence/internal/v1/intelligence/rag-answer"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Service-Token", "service-token"))
            .andExpect(content().json("""
                {
                  "userId": "usr_1",
                  "scope": "USER",
                  "documentGroupId": null,
                  "question": "how to search?",
                  "limit": 8,
                  "modelId": null
                }
                """))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "data": {
                    "answer": "Use semantic search.",
                    "citations": [
                      {
                        "noteId": "note-1",
                        "title": "Search",
                        "excerpt": "semantic context",
                        "score": 0.91,
                        "matchedType": "SEMANTIC"
                      }
                    ],
                    "modelId": "model-default",
                    "tokenEstimate": 42,
                    "charged": true,
                    "tokenUsage": {
                      "promptTokens": 10,
                      "completionTokens": 5,
                      "totalTokens": 15,
                      "cachedPromptTokens": 0,
                      "reasoningTokens": 0
                    }
                  },
                  "message": "ok"
                }
                """, MediaType.APPLICATION_JSON));

        var response = gateway.askNotes("usr_1", new IntelligenceSearchGateway.AskNotesQuery(
            "how to search?",
            8,
            "USER",
            null,
            null
        ));

        assertThat(response.answer()).isEqualTo("Use semantic search.");
        assertThat(response.citations()).hasSize(1);
        assertThat(response.tokenUsage().totalTokens()).isEqualTo(15);
        server.verify();
    }

    private static BrainxServiceProperties serviceProperties() {
        BrainxServiceProperties serviceProperties = new BrainxServiceProperties();
        serviceProperties.setServiceToken("service-token");
        return serviceProperties;
    }
}
