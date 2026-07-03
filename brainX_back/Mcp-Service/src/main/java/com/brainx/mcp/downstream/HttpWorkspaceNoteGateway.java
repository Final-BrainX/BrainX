package com.brainx.mcp.downstream;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class HttpWorkspaceNoteGateway implements WorkspaceNoteGateway {

    static final String USER_ID_HEADER = "X-User-Id";
    static final String SERVICE_TOKEN_HEADER = "X-Service-Token";

    private final RestClient restClient;
    private final BrainxServiceProperties serviceProperties;

    @Autowired
    public HttpWorkspaceNoteGateway(
        WorkspaceClientProperties properties,
        BrainxServiceProperties serviceProperties
    ) {
        this(createRestClient(properties), serviceProperties);
    }

    HttpWorkspaceNoteGateway(RestClient restClient, BrainxServiceProperties serviceProperties) {
        this.restClient = restClient;
        this.serviceProperties = serviceProperties;
    }

    @Override
    public NoteDetail getNote(String userId, String noteId) {
        try {
            ApiEnvelope<NoteDetail> response = restClient.get()
                .uri("/api/v1/notes/{noteId}", noteId)
                .header(USER_ID_HEADER, userId)
                .retrieve()
                .body(new ParameterizedTypeReference<ApiEnvelope<NoteDetail>>() {
                });
            if (response == null || response.data() == null) {
                throw new DownstreamServiceException("Workspace note response did not include data.");
            }
            return response.data();
        } catch (RestClientResponseException exception) {
            throw new DownstreamServiceException(
                "Workspace note read failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new DownstreamServiceException("Workspace note read failed.", exception);
        }
    }

    @Override
    public CreatedNote createNote(String userId, CreateNoteCommand command) {
        String externalId = "mcp-" + UUID.randomUUID();
        var request = new BulkCreateRequest(
            userId,
            "MCP_TOOL_CALL",
            command.folderId(),
            List.of(new BulkCreateItem(externalId, command.title(), command.markdown(), command.tags(), List.of()))
        );
        try {
            ApiEnvelope<BulkCreateData> response = restClient.post()
                .uri("/internal/v1/workspace/notes/bulk-create")
                .header(SERVICE_TOKEN_HEADER, serviceProperties.getServiceToken())
                .body(request)
                .retrieve()
                .body(new ParameterizedTypeReference<ApiEnvelope<BulkCreateData>>() {
                });
            if (response == null || response.data() == null
                || response.data().createdNotes() == null || response.data().createdNotes().isEmpty()) {
                throw new DownstreamServiceException("Workspace note creation response did not include created note data.");
            }
            InternalCreatedNote created = response.data().createdNotes().getFirst();
            NoteDetail stored = getNote(userId, created.noteId());
            return new CreatedNote(
                created.noteId(),
                stored.title(),
                command.folderId(),
                created.version(),
                null
            );
        } catch (RestClientResponseException exception) {
            throw new DownstreamServiceException(
                "Workspace note creation failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new DownstreamServiceException("Workspace note creation failed.", exception);
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiEnvelope<T>(
        boolean success,
        T data,
        String message
    ) {
    }

    record BulkCreateRequest(
        String userId,
        String source,
        String targetFolderId,
        List<BulkCreateItem> notes
    ) {
    }

    record BulkCreateItem(
        String externalId,
        String title,
        String markdown,
        List<String> tags,
        List<String> assets
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record BulkCreateData(
        List<InternalCreatedNote> createdNotes,
        List<Map<String, Object>> failedItems
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record InternalCreatedNote(
        String externalId,
        String noteId,
        int version,
        Instant createdAt
    ) {
    }
}
