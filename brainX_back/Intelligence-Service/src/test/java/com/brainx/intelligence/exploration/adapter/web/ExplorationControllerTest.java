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
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GetNoteSummaryQuery;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.NoteSummaryResult;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SearchResultView;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchResponse;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SummarySource;
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
    private GetNoteSummaryUseCase getNoteSummaryUseCase;

    @Test
    void semanticSearchMatchesOpenApiContract() throws Exception {
        when(semanticSearchUseCase.semanticSearch(any(SemanticSearchCommand.class)))
            .thenReturn(new SemanticSearchResponse(
                List.of(new SearchResultView(
                    "note-1",
                    "RAG 검색 품질",
                    "검색 결과에는 source note가 필요하다.",
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
                      "query": "RAG 검색",
                      "filters": {},
                      "limit": 5,
                      "hybridWithClientKeywordIds": ["keyword-1"]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.message").value("Success"))
            .andExpect(jsonPath("$.data.results[0].noteId").value("note-1"))
            .andExpect(jsonPath("$.data.results[0].title").value("RAG 검색 품질"))
            .andExpect(jsonPath("$.data.results[0].excerpt").value("검색 결과에는 source note가 필요하다."))
            .andExpect(jsonPath("$.data.results[0].score").value(0.91d))
            .andExpect(jsonPath("$.data.results[0].matchedType").value("HYBRID"))
            .andExpect(jsonPath("$.data.tokenEstimate").value(42))
            .andExpect(jsonPath("$.data.charged").value(true));

        verify(semanticSearchUseCase).semanticSearch(argThat(command ->
            command.userId().equals("user-1")
                && command.scope() == SearchScope.DOCUMENT_GROUP
                && command.documentGroupId().equals("group-1")
                && command.query().equals("RAG 검색")
                && command.limit().equals(5)
                && command.hybridWithClientKeywordIds().equals(List.of("keyword-1"))
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
                      "query": "전체 노트 검색"
                    }
                    """))
            .andExpect(status().isOk());

        verify(semanticSearchUseCase).semanticSearch(argThat(command ->
            command.scope() == SearchScope.USER
                && command.documentGroupId() == null
                && command.query().equals("전체 노트 검색")
        ));
    }

    @Test
    void internalSemanticSearchUsesServiceTokenAndRequestUserId() throws Exception {
        when(semanticSearchUseCase.semanticSearch(any(SemanticSearchCommand.class)))
            .thenReturn(new SemanticSearchResponse(List.of(), 7, false));

        mockMvc.perform(post("/internal/v1/intelligence/semantic-search")
                .header("X-Service-Token", "local-service-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userId": "user-from-mcp",
                      "scope": "USER",
                      "query": "fastapi notes",
                      "limit": 10
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
                      "query": "전체 노트 검색"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void getNoteSummaryMatchesOpenApiContract() throws Exception {
        when(getNoteSummaryUseCase.getNoteSummary(any(GetNoteSummaryQuery.class)))
            .thenReturn(new NoteSummaryResult("note-1", "요약 본문", SummarySource.AI));

        mockMvc.perform(get("/api/v1/notes/note-1/summary").with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.noteId").value("note-1"))
            .andExpect(jsonPath("$.data.summary").value("요약 본문"))
            .andExpect(jsonPath("$.data.source").value("AI"));

        verify(getNoteSummaryUseCase).getNoteSummary(argThat(query ->
            query.userId().equals("user-1") && query.noteId().equals("note-1")
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
