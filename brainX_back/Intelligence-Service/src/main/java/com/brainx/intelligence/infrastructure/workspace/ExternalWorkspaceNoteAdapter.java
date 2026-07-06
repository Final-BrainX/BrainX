package com.brainx.intelligence.infrastructure.workspace;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

@Component
public class ExternalWorkspaceNoteAdapter implements WorkspaceNotePort {

    static final String SERVICE_TOKEN_HEADER = "X-Service-Token";
    static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    private static final String AGENT_SOURCE = "INTELLIGENCE_AGENT";
    private static final String SOURCE_SERVICE = "Intelligence-Service";

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
                .header(SERVICE_TOKEN_HEADER, properties.getServiceToken())
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

    @Override
    public CreatedNote createNoteFromAgent(CreateNoteCommand command) {
        requireServiceToken("agent note creation");
        try {
            BulkCreateResponse response = restClient.post()
                .uri("/internal/v1/workspace/notes/bulk-create")
                .header(SERVICE_TOKEN_HEADER, properties.getServiceToken())
                .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey(command.actionId()))
                .body(new BulkCreateRequest(
                    command.userId(),
                    AGENT_SOURCE,
                    blankToNull(command.targetFolderId()),
                    List.of(new BulkCreateNoteItem(
                        command.actionId(),
                        command.title(),
                        command.markdown(),
                        command.tags() == null ? List.of() : command.tags(),
                        List.of()
                    ))
                ))
                .retrieve()
                .body(BulkCreateResponse.class);
            if (response == null || response.data() == null || response.data().createdNotes() == null
                || response.data().createdNotes().isEmpty()) {
                throw new WorkspaceNoteAdapterException("Workspace bulk-create response did not include created note data.");
            }
            BulkCreatedNote note = response.data().createdNotes().getFirst();
            return new CreatedNote(note.noteId(), note.version());
        } catch (RestClientResponseException exception) {
            throw new WorkspaceNoteAdapterException(
                "Workspace agent note creation failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new WorkspaceNoteAdapterException("Workspace agent note creation failed.", exception);
        }
    }

    @Override
    public NoteContentPatchResult appendNoteContentFromAgent(AppendNoteContentCommand command) {
        requireServiceToken("agent note append");
        try {
            ContentPatchResponse response = restClient.post()
                .uri("/internal/v1/workspace/notes/{noteId}/content-patches", command.noteId())
                .header(SERVICE_TOKEN_HEADER, properties.getServiceToken())
                .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey(command.actionId()))
                .body(new ContentPatchRequest(
                    SOURCE_SERVICE,
                    command.baseVersion(),
                    "APPEND",
                    Map.of("text", command.appendMarkdown()),
                    command.actionId()
                ))
                .retrieve()
                .body(ContentPatchResponse.class);
            if (response == null || response.data() == null) {
                throw new WorkspaceNoteAdapterException("Workspace content patch response did not include data.");
            }
            return new NoteContentPatchResult(
                response.data().noteId(),
                response.data().version(),
                response.data().savedAt()
            );
        } catch (RestClientResponseException exception) {
            throw new WorkspaceNoteAdapterException(
                "Workspace agent note append failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new WorkspaceNoteAdapterException("Workspace agent note append failed.", exception);
        }
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

    private void requireServiceToken(String operation) {
        if (!StringUtils.hasText(properties.getServiceToken())) {
            throw new WorkspaceNoteAdapterException("BRAINX_WORKSPACE_SERVICE_TOKEN must be set for " + operation + " calls.");
        }
    }

    private static String idempotencyKey(String actionId) {
        return StringUtils.hasText(actionId) ? "agent-" + actionId : java.util.UUID.randomUUID().toString();
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    record SnapshotResponse(boolean success, String message, SnapshotData data) {
    }

    record SnapshotData(
        String noteId,
        String documentGroupId,
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
                documentGroupId,
                title,
                markdown,
                tags == null ? List.of() : tags,
                folderId,
                version,
                updatedAt
            );
        }
    }

    record BulkCreateRequest(
        String userId,
        String source,
        String targetFolderId,
        List<BulkCreateNoteItem> notes
    ) {
    }

    record BulkCreateNoteItem(
        String externalId,
        String title,
        String markdown,
        List<String> tags,
        List<String> assets
    ) {
    }

    record BulkCreateResponse(boolean success, String message, BulkCreateData data) {
    }

    record BulkCreateData(List<BulkCreatedNote> createdNotes) {
    }

    record BulkCreatedNote(
        String externalId,
        String noteId,
        int version
    ) {
    }

    record ContentPatchRequest(
        String sourceService,
        int baseVersion,
        String patchType,
        Map<String, Object> patch,
        String causationId
    ) {
    }

    record ContentPatchResponse(boolean success, String message, ContentPatchData data) {
    }

    record ContentPatchData(
        String noteId,
        int version,
        Instant savedAt,
        String status
    ) {
    }
}
