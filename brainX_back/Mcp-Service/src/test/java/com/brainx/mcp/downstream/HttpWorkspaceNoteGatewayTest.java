package com.brainx.mcp.downstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
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

    @Test
    void deleteNoteUsesServiceTokenAndReturnsWorkspaceResult() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://workspace");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        BrainxServiceProperties serviceProperties = new BrainxServiceProperties();
        serviceProperties.setServiceToken("service-token");
        HttpWorkspaceNoteGateway gateway = new HttpWorkspaceNoteGateway(builder.build(), serviceProperties);

        server.expect(once(), requestTo(
                "http://workspace/internal/v1/workspace/users/usr_1/notes/note-1?mode=trash"
            ))
            .andExpect(method(HttpMethod.DELETE))
            .andExpect(header("X-Service-Token", "service-token"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "data": {
                    "noteId": "note-1",
                    "deletedAt": "2026-07-10T00:00:00Z",
                    "purgeAt": "2026-08-09T00:00:00Z"
                  },
                  "message": "ok"
                }
                """, MediaType.APPLICATION_JSON));

        WorkspaceNoteGateway.DeletedNote result = gateway.deleteNote("usr_1", "note-1", "trash");

        assertThat(result.noteId()).isEqualTo("note-1");
        assertThat(result.deletedAt()).hasToString("2026-07-10T00:00:00Z");
        assertThat(result.purgeAt()).hasToString("2026-08-09T00:00:00Z");
        server.verify();
    }

    @Test
    void deleteNoteDoesNotExposeDownstreamResponseBody() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://workspace");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        BrainxServiceProperties serviceProperties = new BrainxServiceProperties();
        serviceProperties.setServiceToken("service-token");
        HttpWorkspaceNoteGateway gateway = new HttpWorkspaceNoteGateway(builder.build(), serviceProperties);

        server.expect(once(), requestTo(
                "http://workspace/internal/v1/workspace/users/usr_1/notes/missing?mode=permanent"
            ))
            .andRespond(withStatus(HttpStatus.NOT_FOUND)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\":\"private downstream detail\"}"));

        assertThatThrownBy(() -> gateway.deleteNote("usr_1", "missing", "permanent"))
            .isInstanceOf(DownstreamServiceException.class)
            .hasMessage("Workspace note deletion failed with status 404.")
            .hasMessageNotContaining("private downstream detail");

        server.verify();
    }
}
