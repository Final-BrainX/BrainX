package com.brainx.intelligence.infrastructure.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.CreateNoteCommand;
import com.brainx.intelligence.shared.domain.DocumentGroups;

class ExternalWorkspaceNoteAdapterTest {

    @Test
    void getNoteSnapshotCallsInternalApiWithServiceTokenHeader() {
        WorkspaceClientProperties properties = properties("service-token");
        RestClient.Builder builder = RestClient.builder().baseUrl("https://workspace.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExternalWorkspaceNoteAdapter adapter = new ExternalWorkspaceNoteAdapter(builder.build(), properties);
        server.expect(requestTo("https://workspace.test/internal/v1/workspace/notes/note-1/snapshot"))
            .andExpect(header("X-Service-Token", "service-token"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "message": "ok",
                  "data": {
                    "noteId": "note-1",
                    "userId": "user-1",
                    "documentGroupId": "group-1",
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
        assertThat(snapshot.userId()).isEqualTo("user-1");
        assertThat(snapshot.documentGroupId()).isEqualTo("group-1");
        assertThat(snapshot.title()).isEqualTo("Snapshot title");
        assertThat(snapshot.markdown()).contains("Snapshot markdown");
        assertThat(snapshot.tags()).containsExactly("tag-1");
        assertThat(snapshot.folderId()).isEqualTo("folder-1");
        assertThat(snapshot.version()).isEqualTo(3);
        server.verify();
    }

    @Test
    void createNoteFromAgentPassesDocumentGroupIdToBulkCreate() {
        WorkspaceClientProperties properties = properties("service-token");
        RestClient.Builder builder = RestClient.builder().baseUrl("https://workspace.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExternalWorkspaceNoteAdapter adapter = new ExternalWorkspaceNoteAdapter(builder.build(), properties);
        server.expect(requestTo("https://workspace.test/internal/v1/workspace/notes/bulk-create"))
            .andExpect(header("X-Service-Token", "service-token"))
            .andExpect(header("Idempotency-Key", "agent-action-1"))
            .andExpect(jsonPath("$.userId").value("user-1"))
            .andExpect(jsonPath("$.source").value("INTELLIGENCE_AGENT"))
            .andExpect(jsonPath("$.documentGroupId").value("dgrp_custom"))
            .andExpect(jsonPath("$.targetFolderId").value("folder-1"))
            .andExpect(jsonPath("$.notes[0].externalId").value("action-1"))
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "message": "ok",
                  "data": {
                    "createdNotes": [
                      {
                        "externalId": "action-1",
                        "noteId": "note-created",
                        "version": 1
                      }
                    ]
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var created = adapter.createNoteFromAgent(new CreateNoteCommand(
            "user-1",
            "dgrp_custom",
            "action-1",
            "Title",
            "# Title",
            List.of("agent"),
            " folder-1 "
        ));

        assertThat(created.noteId()).isEqualTo("note-created");
        assertThat(created.version()).isEqualTo(1);
        server.verify();
    }

    @Test
    void createNoteFromAgentOmitsLogicalDefaultDocumentGroupId() {
        WorkspaceClientProperties properties = properties("service-token");
        RestClient.Builder builder = RestClient.builder().baseUrl("https://workspace.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ExternalWorkspaceNoteAdapter adapter = new ExternalWorkspaceNoteAdapter(builder.build(), properties);
        server.expect(requestTo("https://workspace.test/internal/v1/workspace/notes/bulk-create"))
            .andExpect(header("X-Service-Token", "service-token"))
            .andExpect(jsonPath("$.userId").value("user-1"))
            .andExpect(jsonPath("$.source").value("INTELLIGENCE_AGENT"))
            .andExpect(jsonPath("$.documentGroupId").doesNotExist())
            .andRespond(withSuccess("""
                {
                  "success": true,
                  "message": "ok",
                  "data": {
                    "createdNotes": [
                      {
                        "externalId": "action-1",
                        "noteId": "note-created",
                        "version": 1
                      }
                    ]
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var created = adapter.createNoteFromAgent(new CreateNoteCommand(
            "user-1",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            "action-1",
            "Title",
            "# Title",
            List.of(),
            null
        ));

        assertThat(created.noteId()).isEqualTo("note-created");
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
