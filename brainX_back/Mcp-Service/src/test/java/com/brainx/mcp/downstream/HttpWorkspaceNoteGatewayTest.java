package com.brainx.mcp.downstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class HttpWorkspaceNoteGatewayTest {

    @Test
    void createNoteFetchesAndReturnsWorkspaceStoredTitle() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://workspace");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        BrainxServiceProperties serviceProperties = new BrainxServiceProperties();
        serviceProperties.setServiceToken("service-token");
        HttpWorkspaceNoteGateway gateway = new HttpWorkspaceNoteGateway(builder.build(), serviceProperties);

        server.expect(once(), requestTo("http://workspace/internal/v1/workspace/notes/bulk-create"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Service-Token", "service-token"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "data": {
                    "createdNotes": [
                      {
                        "externalId": "mcp-1",
                        "noteId": "note-1",
                        "version": 1
                      }
                    ],
                    "failedItems": []
                  },
                  "message": "ok"
                }
                """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://workspace/api/v1/notes/note-1"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("X-User-Id", "usr_1"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "data": {
                    "noteId": "note-1",
                    "title": "FastAPI Draft 2",
                    "markdown": "# FastAPI",
                    "folder": null,
                    "tags": ["mcp"],
                    "version": 1,
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z"
                  },
                  "message": "ok"
                }
                """, MediaType.APPLICATION_JSON));

        WorkspaceNoteGateway.CreatedNote result = gateway.createNote(
            "usr_1",
            new WorkspaceNoteGateway.CreateNoteCommand("FastAPI Draft", "# FastAPI", null, List.of("mcp"))
        );

        assertThat(result.title()).isEqualTo("FastAPI Draft 2");
        server.verify();
    }
}
