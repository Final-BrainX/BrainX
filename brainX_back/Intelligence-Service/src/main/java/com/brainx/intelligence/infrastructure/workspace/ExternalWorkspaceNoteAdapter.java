package com.brainx.intelligence.infrastructure.workspace;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

@Component
public class ExternalWorkspaceNoteAdapter implements WorkspaceNotePort {

    private final RestClient restClient;
    private final WorkspaceClientProperties properties;

    @Autowired
    public ExternalWorkspaceNoteAdapter(WorkspaceClientProperties properties) {
        this(createRestClient(properties), properties);
    }

    ExternalWorkspaceNoteAdapter(RestClient restClient, WorkspaceClientProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public NoteSnapshot getNoteSnapshot(String noteId) {
        if (!StringUtils.hasText(properties.getServiceToken())) {
            throw new WorkspaceNoteAdapterException("BRAINX_WORKSPACE_SERVICE_TOKEN must be set for note snapshot calls.");
        }
        try {
            SnapshotResponse response = restClient.get()
                .uri("/internal/v1/workspace/notes/{noteId}/snapshot", noteId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getServiceToken())
                .retrieve()
                .body(SnapshotResponse.class);
            if (response == null || response.data() == null) {
                throw new WorkspaceNoteAdapterException("Workspace snapshot response did not include data.");
            }
            return response.data().toSnapshot();
        } catch (RestClientResponseException exception) {
            throw new WorkspaceNoteAdapterException(
                "Workspace snapshot call failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new WorkspaceNoteAdapterException("Workspace snapshot call failed.", exception);
        }
    }

    @Override
    public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        // Workspace patch integration is implemented with the assist domain.
    }

    private static RestClient createRestClient(WorkspaceClientProperties properties) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getTimeout());
        requestFactory.setReadTimeout(properties.getTimeout());
        return RestClient.builder()
            .baseUrl(properties.getBaseUrl().toString())
            .requestFactory(requestFactory)
            .build();
    }

    record SnapshotResponse(boolean success, String message, SnapshotData data) {
    }

    record SnapshotData(
        String noteId,
        String title,
        String markdown,
        List<String> tags,
        String folderId,
        int version,
        java.time.Instant updatedAt
    ) {

        NoteSnapshot toSnapshot() {
            return new NoteSnapshot(
                noteId,
                title,
                markdown,
                tags == null ? List.of() : tags,
                folderId,
                version,
                updatedAt
            );
        }
    }
}
