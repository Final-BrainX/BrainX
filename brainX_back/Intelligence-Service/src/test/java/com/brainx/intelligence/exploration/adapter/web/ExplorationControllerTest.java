package com.brainx.intelligence.exploration.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase.NoteIndexStatusView;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase.NoteIndexStatusesCommand;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase.NoteIndexStatusesResponse;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GenerateNoteSummaryCommand;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GetNoteSummaryQuery;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.NoteSummaryResult;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SearchResultView;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchResponse;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchMode;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SummarySource;
import com.brainx.intelligence.exploration.domain.ExplorationNotFoundException;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

@WebMvcTest(ExplorationController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class ExplorationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SemanticSearchUseCase semanticSearchUseCase;

    @MockitoBean
    private GetNoteIndexStatusesUseCase getNoteIndexStatusesUseCase;

    @MockitoBean
    private GetNoteSummaryUseCase getNoteSummaryUseCase;

    @Test
    void semanticSearchMatchesOpenApiContract() throws Exception {
        when(semanticSearchUseCase.semanticSearch(any(SemanticSearchCommand.class)))
            .thenReturn(new SemanticSearchResponse(
                List.of(new SearchResultView(
                    "note-1",
                    "RAG search memo",
                    "Search results need source notes.",
                    0.91d,
                    SearchMatchType.HYBRID
                )),
                42,
                true
            ));

        mockMvc.perform(post("/api/v1/intelligence/semantic-search")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": "DOCUMENT_GROUP",
                      "documentGroupId": "group-1",
                      "query": "RAG search",
                      "filters": {},
                      "limit": 5,
                      "hybridWithClientKeywordIds": ["keyword-1"],
                      "searchMode": "HYBRID"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.message").value("Success"))
            .andExpect(jsonPath("$.data.results[0].noteId").value("note-1"))
            .andExpect(jsonPath("$.data.results[0].title").value("RAG search memo"))
            .andExpect(jsonPath("$.data.results[0].excerpt").value("Search results need source notes."))
            .andExpect(jsonPath("$.data.results[0].score").value(0.91d))
            .andExpect(jsonPath("$.data.results[0].matchedType").value("HYBRID"))
            .andExpect(jsonPath("$.data.tokenEstimate").value(42))
            .andExpect(jsonPath("$.data.charged").value(true));

        verify(semanticSearchUseCase).semanticSearch(argThat(command ->
            command.userId().equals("user-1")
                && command.scope() == SearchScope.DOCUMENT_GROUP
                && command.documentGroupId().equals("group-1")
                && command.query().equals("RAG search")
                && command.limit().equals(5)
                && command.hybridWithClientKeywordIds().equals(List.of("keyword-1"))
                && command.searchMode() == SearchMode.HYBRID
        ));
    }

    @Test
    void semanticSearchAcceptsUserScopeWithoutDocumentGroup() throws Exception {
        when(semanticSearchUseCase.semanticSearch(any(SemanticSearchCommand.class)))
            .thenReturn(new SemanticSearchResponse(List.of(), 10, true));

        mockMvc.perform(post("/api/v1/intelligence/semantic-search")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": "USER",
                      "query": "all notes"
                    }
                    """))
            .andExpect(status().isOk());

        verify(semanticSearchUseCase).semanticSearch(argThat(command ->
            command.scope() == SearchScope.USER
                && command.documentGroupId() == null
                && command.query().equals("all notes")
                && command.searchMode() == SearchMode.SEMANTIC
        ));
    }

    @Test
    void internalSemanticSearchUsesServiceTokenAndRequestUserId() throws Exception {
        when(semanticSearchUseCase.semanticSearch(any(SemanticSearchCommand.class)))
            .thenReturn(new SemanticSearchResponse(List.of(), 7, false));

        mockMvc.perform(post("/internal/v1/intelligence/semantic-search")
                .header("X-Service-Token", "test_intelligence_service_token_at_least_32_bytes")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "scope": "USER",
                      "query": "fastapi notes",
                      "limit": 10,
                      "searchMode": "KEYWORD"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.tokenEstimate").value(7))
            .andExpect(jsonPath("$.data.charged").value(false));

        verify(semanticSearchUseCase).semanticSearch(argThat(command ->
            command.userId().equals("user-from-mcp")
                && command.scope() == SearchScope.USER
                && command.documentGroupId() == null
                && command.query().equals("fastapi notes")
                && command.limit().equals(10)
                && command.searchMode() == SearchMode.KEYWORD
        ));
    }

    @Test
    void internalSemanticSearchRequiresServiceToken() throws Exception {
        mockMvc.perform(post("/internal/v1/intelligence/semantic-search")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "scope": "USER",
                      "query": "fastapi notes"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void semanticSearchRejectsUserScopeWithDocumentGroup() throws Exception {
        mockMvc.perform(post("/api/v1/intelligence/semantic-search")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": "USER",
                      "documentGroupId": "group-1",
                      "query": "all notes"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void noteIndexStatusesMatchesOpenApiContract() throws Exception {
        when(getNoteIndexStatusesUseCase.getNoteIndexStatuses(any(NoteIndexStatusesCommand.class)))
            .thenReturn(new NoteIndexStatusesResponse(List.of(
                new NoteIndexStatusView("note-1", "INDEXED", true, java.time.Instant.parse("2026-07-03T00:00:00Z")),
                new NoteIndexStatusView("note-2", "FAILED", false, null)
            )));

        mockMvc.perform(post("/api/v1/intelligence/note-index-statuses")
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
            .andExpect(jsonPath("$.data.notes[0].noteId").value("note-1"))
            .andExpect(jsonPath("$.data.notes[0].searchIndexStatus").value("INDEXED"))
            .andExpect(jsonPath("$.data.notes[0].availableForAiFeatures").value(true))
            .andExpect(jsonPath("$.data.notes[0].indexedAt").value("2026-07-03T00:00:00Z"))
            .andExpect(jsonPath("$.data.notes[1].noteId").value("note-2"))
            .andExpect(jsonPath("$.data.notes[1].searchIndexStatus").value("FAILED"))
            .andExpect(jsonPath("$.data.notes[1].availableForAiFeatures").value(false));

        verify(getNoteIndexStatusesUseCase).getNoteIndexStatuses(argThat(command ->
            command.userId().equals("user-1")
                && command.documentGroupId().equals("group-1")
                && command.noteIds().equals(List.of("note-1", "note-2"))
        ));
    }

    @Test
    void noteIndexStatusesRejectsEmptyNoteIds() throws Exception {
        mockMvc.perform(post("/api/v1/intelligence/note-index-statuses")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteIds": []
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void getNoteSummaryMatchesOpenApiContract() throws Exception {
        when(getNoteSummaryUseCase.getNoteSummary(any(GetNoteSummaryQuery.class)))
            .thenReturn(new NoteSummaryResult("note-1", "summary body", SummarySource.AI));

        mockMvc.perform(get("/api/v1/notes/note-1/summary").with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.noteId").value("note-1"))
            .andExpect(jsonPath("$.data.summary").value("summary body"))
            .andExpect(jsonPath("$.data.source").value("AI"));

        verify(getNoteSummaryUseCase).getNoteSummary(argThat(query ->
            query.userId().equals("user-1") && query.noteId().equals("note-1")
        ));
    }

    @Test
    void getNoteSummaryMapsMissingWorkspaceNoteToNotFound() throws Exception {
        when(getNoteSummaryUseCase.getNoteSummary(any(GetNoteSummaryQuery.class)))
            .thenThrow(new ExplorationNotFoundException("Note was not found."));

        mockMvc.perform(get("/api/v1/notes/missing-note/summary").with(user("user-1")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void generateNoteSummaryMatchesOpenApiContract() throws Exception {
        when(getNoteSummaryUseCase.generateNoteSummary(any(GenerateNoteSummaryCommand.class)))
            .thenReturn(new NoteSummaryResult(
                "note-1",
                "first line\nsecond line\nthird line",
                SummarySource.AI,
                "group-1",
                "hash-1",
                java.time.Instant.parse("2026-07-09T00:00:00Z"),
                "gpt-5.4-nano"
            ));

        mockMvc.perform(post("/api/v1/notes/note-1/summary")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "force": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.noteId").value("note-1"))
            .andExpect(jsonPath("$.data.summary").value("first line\nsecond line\nthird line"))
            .andExpect(jsonPath("$.data.source").value("AI"))
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.markdownHash").value("hash-1"))
            .andExpect(jsonPath("$.data.generatedAt").value("2026-07-09T00:00:00Z"))
            .andExpect(jsonPath("$.data.modelId").value("gpt-5.4-nano"));

        verify(getNoteSummaryUseCase).generateNoteSummary(argThat(command ->
            command.userId().equals("user-1")
                && command.noteId().equals("note-1")
                && command.documentGroupId().equals("group-1")
                && command.force()
        ));
    }

    @Test
    void apiRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/intelligence/semantic-search")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "query": "RAG"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Authentication required."))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void semanticSearchRejectsBlankQuery() throws Exception {
        mockMvc.perform(post("/api/v1/intelligence/semantic-search")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "query": " "
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }
}
