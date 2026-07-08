package com.brainx.intelligence.chat.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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

import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCitationView;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCommand;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesResponse;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesTokenUsageView;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

@WebMvcTest(InternalRagAnswerController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class InternalRagAnswerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AskNotesUseCase askNotesUseCase;

    @Test
    void internalRagAnswerUsesServiceTokenAndRequestUserId() throws Exception {
        when(askNotesUseCase.askNotes(any(AskNotesCommand.class)))
            .thenReturn(new AskNotesResponse(
                "Use semantic search.",
                List.of(new AskNotesCitationView(
                    "note-1",
                    "Search memo",
                    "Semantic search context",
                    0.91d,
                    SearchMatchType.SEMANTIC
                )),
                "model-default",
                42,
                true,
                new AskNotesTokenUsageView(10, 5, 15, 0, 0)
            ));

        mockMvc.perform(post("/internal/v1/intelligence/rag-answer")
                .header("X-Service-Token", "local-service-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "question": "How should agents search notes?",
                      "limit": 8
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.answer").value("Use semantic search."))
            .andExpect(jsonPath("$.data.citations[0].noteId").value("note-1"))
            .andExpect(jsonPath("$.data.citations[0].matchedType").value("SEMANTIC"))
            .andExpect(jsonPath("$.data.modelId").value("model-default"))
            .andExpect(jsonPath("$.data.tokenEstimate").value(42))
            .andExpect(jsonPath("$.data.charged").value(true))
            .andExpect(jsonPath("$.data.tokenUsage.totalTokens").value(15));

        verify(askNotesUseCase).askNotes(argThat(command ->
            command.userId().equals("user-from-mcp")
                && command.scope() == null
                && command.documentGroupId() == null
                && command.question().equals("How should agents search notes?")
                && command.limit().equals(8)
        ));
    }

    @Test
    void internalRagAnswerAcceptsDocumentGroupScope() throws Exception {
        when(askNotesUseCase.askNotes(any(AskNotesCommand.class)))
            .thenReturn(new AskNotesResponse("Answer", List.of(), "model", 1, true, null));

        mockMvc.perform(post("/internal/v1/intelligence/rag-answer")
                .header("X-Service-Token", "local-service-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "scope": "DOCUMENT_GROUP",
                      "documentGroupId": "group-1",
                      "question": "question"
                    }
                    """))
            .andExpect(status().isOk());

        verify(askNotesUseCase).askNotes(argThat(command ->
            command.scope() == SearchScope.DOCUMENT_GROUP
                && command.documentGroupId().equals("group-1")
        ));
    }

    @Test
    void internalRagAnswerRequiresServiceToken() throws Exception {
        mockMvc.perform(post("/internal/v1/intelligence/rag-answer")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "question": "question"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }
}
