package com.brainx.intelligence.infrastructure.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ExternalWorkspaceNoteAdapterTest {

    @Test
    void getNoteSnapshotCallsInternalApiWithBearerToken() {
        WorkspaceClientProperties properties = properties("service-token");
        RestClient.Builder builder = RestClient.builder().baseUrl("https://workspace.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExternalWorkspaceNoteAdapter adapter = new ExternalWorkspaceNoteAdapter(builder.build(), properties);
        server.expect(requestTo("https://workspace.test/internal/v1/workspace/notes/note-1/snapshot"))
            .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer service-token"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "message": "ok",
                  "data": {
                    "noteId": "note-1",
                    "title": "Snapshot title",
                    "markdown": "# Snapshot markdown",
                    "tags": ["tag-1"],
                    "folderId": "folder-1",
                    "version": 3,
                    "updatedAt": "2026-06-19T00:00:00Z"
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var snapshot = adapter.getNoteSnapshot("note-1");

        assertThat(snapshot.noteId()).isEqualTo("note-1");
        assertThat(snapshot.title()).isEqualTo("Snapshot title");
        assertThat(snapshot.markdown()).contains("Snapshot markdown");
        assertThat(snapshot.tags()).containsExactly("tag-1");
        assertThat(snapshot.folderId()).isEqualTo("folder-1");
        assertThat(snapshot.version()).isEqualTo(3);
        server.verify();
    }

    @Test
    void missingServiceTokenFailsBeforeHttpCall() {
        WorkspaceClientProperties properties = properties("");
        ExternalWorkspaceNoteAdapter adapter = new ExternalWorkspaceNoteAdapter(
            RestClient.builder().baseUrl("https://workspace.test").build(),
            properties
        );

        assertThatThrownBy(() -> adapter.getNoteSnapshot("note-1"))
            .isInstanceOf(WorkspaceNoteAdapterException.class)
            .hasMessageContaining("BRAINX_WORKSPACE_SERVICE_TOKEN")
            .hasMessageNotContaining("service-token");
    }

    private static WorkspaceClientProperties properties(String token) {
        WorkspaceClientProperties properties = new WorkspaceClientProperties();
        properties.setBaseUrl(URI.create("https://workspace.test"));
        properties.setServiceToken(token);
        properties.setTimeout(Duration.ofSeconds(1));
        return properties;
    }
}
