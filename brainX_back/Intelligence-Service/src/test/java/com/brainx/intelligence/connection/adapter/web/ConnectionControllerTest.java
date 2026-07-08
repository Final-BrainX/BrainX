package com.brainx.intelligence.connection.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptRecommendation;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsResult;
import com.brainx.intelligence.connection.domain.ConnectionConflictException;
import com.brainx.intelligence.connection.domain.ConnectionForbiddenException;
import com.brainx.intelligence.connection.domain.ConnectionNotFoundException;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

@WebMvcTest(ConnectionController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class ConnectionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CreateLinkSuggestionsUseCase createLinkSuggestionsUseCase;

    @MockitoBean
    private CreateBridgeConceptsUseCase createBridgeConceptsUseCase;

    @Test
    void createLinkSuggestionsReturnsWrappedSuggestions() throws Exception {
        when(createLinkSuggestionsUseCase.createLinkSuggestions(any(LinkSuggestionsCommand.class)))
            .thenReturn(new LinkSuggestionsResult(List.of(new LinkSuggestionResult(
                "suggestion-1",
                "target-1",
                "Target title",
                0.86d,
                "related",
                "Anchor text",
                12,
                23
            ))));

        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.suggestions[0].suggestionId").value("suggestion-1"))
            .andExpect(jsonPath("$.data.suggestions[0].targetNoteId").value("target-1"))
            .andExpect(jsonPath("$.data.suggestions[0].targetTitle").value("Target title"))
            .andExpect(jsonPath("$.data.suggestions[0].score").value(0.86d))
            .andExpect(jsonPath("$.data.suggestions[0].reason").value("related"))
            .andExpect(jsonPath("$.data.suggestions[0].anchorText").value("Anchor text"))
            .andExpect(jsonPath("$.data.suggestions[0].anchorStartOffset").value(12))
            .andExpect(jsonPath("$.data.suggestions[0].anchorEndOffset").value(23));

        verify(createLinkSuggestionsUseCase).createLinkSuggestions(argThat(command ->
            command.userId().equals("user-1")
                && command.documentGroupId().equals("group-1")
                && command.noteId().equals("note-1")
        ));
    }

    @Test
    void createLinkSuggestionsRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void createLinkSuggestionsRejectsBlankNoteId() throws Exception {
        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteId": ""
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void createLinkSuggestionsMapsNotFound() throws Exception {
        when(createLinkSuggestionsUseCase.createLinkSuggestions(any(LinkSuggestionsCommand.class)))
            .thenThrow(new ConnectionNotFoundException("missing"));

        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteId": "missing"
                    }
                    """))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void createLinkSuggestionsMapsForbidden() throws Exception {
        when(createLinkSuggestionsUseCase.createLinkSuggestions(any(LinkSuggestionsCommand.class)))
            .thenThrow(new ConnectionForbiddenException("denied"));

        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void createLinkSuggestionsMapsConflict() throws Exception {
        when(createLinkSuggestionsUseCase.createLinkSuggestions(any(LinkSuggestionsCommand.class)))
            .thenThrow(new ConnectionConflictException("limit"));

        mockMvc.perform(post("/api/v1/ai/link-suggestions")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }

    @Test
    void createBridgeConceptsReturnsWrappedRecommendations() throws Exception {
        when(createBridgeConceptsUseCase.createBridgeConcepts(any(BridgeConceptsCommand.class)))
            .thenReturn(new BridgeConceptsResult(List.of(new BridgeConceptRecommendation(
                "bridge-abc123",
                "JDBC 연결 가이드",
                "Java와 Database 노트를 이어준다."
            ))));

        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteIds": ["note-1", "note-2"]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.recommendations[0].noteId").value("bridge-abc123"))
            .andExpect(jsonPath("$.data.recommendations[0].title").value("JDBC 연결 가이드"))
            .andExpect(jsonPath("$.data.recommendations[0].bridgeReason").value("Java와 Database 노트를 이어준다."));

        verify(createBridgeConceptsUseCase).createBridgeConcepts(argThat(command ->
            command.userId().equals("user-1")
                && command.documentGroupId().equals("group-1")
                && command.noteIds().equals(List.of("note-1", "note-2"))
        ));
    }

    @Test
    void createBridgeConceptsRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteIds": ["note-1", "note-2"]
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void createBridgeConceptsRejectsBlankOrInsufficientNoteIds() throws Exception {
        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteIds": ["note-1", ""]
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));

        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteIds": ["note-1"]
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void createBridgeConceptsMapsNotFound() throws Exception {
        when(createBridgeConceptsUseCase.createBridgeConcepts(any(BridgeConceptsCommand.class)))
            .thenThrow(new ConnectionNotFoundException("missing"));

        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteIds": ["note-1", "missing"]
                    }
                    """))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void createBridgeConceptsMapsForbidden() throws Exception {
        when(createBridgeConceptsUseCase.createBridgeConcepts(any(BridgeConceptsCommand.class)))
            .thenThrow(new ConnectionForbiddenException("denied"));

        mockMvc.perform(post("/api/v1/ai/bridge-concepts")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "noteIds": ["note-1", "note-2"]
                    }
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }
}
