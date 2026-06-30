package com.brainx.intelligence.assist.adapter.web;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistCommand;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistResult;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase.AiSuggestionDecisionCommand;
import com.brainx.intelligence.assist.application.port.inbound.DecideAiSuggestionUseCase.AiSuggestionDecisionResult;
import com.brainx.intelligence.assist.domain.AiSuggestionDecision;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

@WebMvcTest(AssistController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class AssistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CreateInlineAssistUseCase createInlineAssistUseCase;

    @MockitoBean
    private DecideAiSuggestionUseCase decideAiSuggestionUseCase;

    @Test
    void createInlineAssistReturnsDeltaAndDoneSseEvents() throws Exception {
        when(createInlineAssistUseCase.createInlineAssist(any(InlineAssistCommand.class)))
            .thenReturn(new InlineAssistResult(
                "suggestion-1",
                InlineAssistAction.REWRITE,
                "gpt-test",
                "rewritten"
            ));

        mockMvc.perform(post("/api/v1/ai/inline-assists")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1",
                      "selectedText": "draft",
                      "contextBefore": "before",
                      "contextAfter": "after",
                      "action": "REWRITE",
                      "language": "ko"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
            .andExpect(content().string(containsString("event: delta")))
            .andExpect(content().string(containsString("data: {\"text\":\"rewritten\"}")))
            .andExpect(content().string(containsString("event: done")))
            .andExpect(content().string(containsString(
                "data: {\"suggestionId\":\"suggestion-1\",\"action\":\"REWRITE\",\"modelId\":\"gpt-test\"}"
            )));

        verify(createInlineAssistUseCase).createInlineAssist(argThat(command ->
            command.userId().equals("user-1")
                && command.noteId().equals("note-1")
                && command.selectedText().equals("draft")
                && command.contextBefore().equals("before")
                && command.contextAfter().equals("after")
                && command.action() == InlineAssistAction.REWRITE
                && command.language().equals("ko")
        ));
    }

    @Test
    void createInlineAssistMapsDraftRequestFields() throws Exception {
        when(createInlineAssistUseCase.createInlineAssist(any(InlineAssistCommand.class)))
            .thenReturn(new InlineAssistResult(
                "suggestion-draft",
                InlineAssistAction.DRAFT,
                "gpt-test",
                "drafted"
            ));

        mockMvc.perform(post("/api/v1/ai/inline-assists")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1",
                      "contextBefore": "before",
                      "contextAfter": "after",
                      "action": "DRAFT",
                      "draftPrompt": "RAG를 소개하는 문단을 작성해줘",
                      "targetLength": 500,
                      "language": "ko"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
            .andExpect(content().string(containsString("data: {\"text\":\"drafted\"}")))
            .andExpect(content().string(containsString(
                "data: {\"suggestionId\":\"suggestion-draft\",\"action\":\"DRAFT\",\"modelId\":\"gpt-test\"}"
            )));

        verify(createInlineAssistUseCase).createInlineAssist(argThat(command ->
            command.userId().equals("user-1")
                && command.noteId().equals("note-1")
                && command.contextBefore().equals("before")
                && command.contextAfter().equals("after")
                && command.action() == InlineAssistAction.DRAFT
                && command.draftPrompt().equals("RAG를 소개하는 문단을 작성해줘")
                && command.targetLength().equals(500)
                && command.language().equals("ko")
        ));
    }

    @Test
    void decideAiSuggestionReturnsWrappedDecisionData() throws Exception {
        when(decideAiSuggestionUseCase.decideAiSuggestion(any(AiSuggestionDecisionCommand.class)))
            .thenReturn(new AiSuggestionDecisionResult("suggestion-1", AiSuggestionDecision.REJECTED));

        mockMvc.perform(post("/api/v1/ai/suggestions/suggestion-1/decision")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "decision": "REJECTED"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.message").value("Success"))
            .andExpect(jsonPath("$.data.suggestionId").value("suggestion-1"))
            .andExpect(jsonPath("$.data.decision").value("REJECTED"));

        verify(decideAiSuggestionUseCase).decideAiSuggestion(argThat(command ->
            command.userId().equals("user-1")
                && command.suggestionId().equals("suggestion-1")
                && command.decision() == AiSuggestionDecision.REJECTED
        ));
    }

    @Test
    void createInlineAssistRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/inline-assists")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1",
                      "selectedText": "draft",
                      "action": "REWRITE"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Authentication required."))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void createInlineAssistRejectsSpellcheckEnum() throws Exception {
        mockMvc.perform(post("/api/v1/ai/inline-assists")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1",
                      "selectedText": "draft",
                      "action": "SPELLCHECK"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }
}
