package com.brainx.ingestion.controller;

import com.brainx.ingestion.dto.response.IngestionResponse.*;
import com.brainx.ingestion.security.JwtTokenProvider;
import com.brainx.ingestion.service.ImportService;
import com.brainx.ingestion.service.NotionApiService.NotionPageItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ImportController.class)
class ImportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ImportService importService;

    // JwtAuthenticationFilter가 의존하므로 Mock으로 대체 (실제 JWT 검증 없이 테스트)
    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    // @EnableJpaAuditing이 메인 클래스에 있어 @WebMvcTest 시 JPA 컨텍스트 충돌 방지
    @MockBean
    private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    private static final String USER_ID = "user-test-001";

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth 인증 URL 생성
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Notion OAuth URL 생성 성공")
    void authorizeNotion_success() throws Exception {
        NotionAuthorizeResponse response = NotionAuthorizeResponse.builder()
                .authorizationUrl("https://api.notion.com/v1/oauth/authorize?client_id=test-client")
                .state("st_abc123456789")
                .build();

        given(importService.generateNotionOAuthUrl(USER_ID)).willReturn(response);

        mockMvc.perform(post("/v1/imports/notion/oauth/authorize")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf()))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.authorizationUrl")
                        .value("https://api.notion.com/v1/oauth/authorize?client_id=test-client"))
                .andExpect(jsonPath("$.data.state").value("st_abc123456789"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth 콜백 처리
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Notion OAuth 콜백 처리 성공")
    void notionCallback_success() throws Exception {
        IntegrationConnectedResponse response = IntegrationConnectedResponse.builder()
                .integrationAccountId("account-abc-123")
                .build();

        given(importService.handleNotionCallback(eq(USER_ID), any())).willReturn(response);

        Map<String, String> body = Map.of(
                "code", "notion-auth-code-xyz",
                "state", "st_abc123456789"
        );

        mockMvc.perform(post("/v1/imports/notion/oauth/callback")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.integrationAccountId").value("account-abc-123"));
    }

    @Test
    @DisplayName("Notion OAuth 콜백 - code 누락 시 400")
    void notionCallback_missingCode_returns400() throws Exception {
        Map<String, String> body = Map.of("state", "st_abc123456789"); // code 없음

        mockMvc.perform(post("/v1/imports/notion/oauth/callback")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andDo(print())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("Notion OAuth 콜백 - state 누락 시 400")
    void notionCallback_missingState_returns400() throws Exception {
        Map<String, String> body = Map.of("code", "notion-auth-code-xyz"); // state 없음

        mockMvc.perform(post("/v1/imports/notion/oauth/callback")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andDo(print())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notion 페이지 목록 조회
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Notion 페이지 목록 조회 성공")
    void getNotionPages_success() throws Exception {
        List<NotionPageItem> pages = List.of(
                new NotionPageItem("page-id-1", "스터디 노트", "2024-06-01T10:00:00Z", "📚"),
                new NotionPageItem("page-id-2", "프로젝트 계획", "2024-06-02T10:00:00Z", null)
        );

        given(importService.getNotionPages(USER_ID, "account-abc-123")).willReturn(pages);

        mockMvc.perform(get("/v1/imports/notion/pages")
                        .with(user(USER_ID).roles("USER"))
                        .param("integrationAccountId", "account-abc-123"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pages").isArray())
                .andExpect(jsonPath("$.data.pages.length()").value(2))
                .andExpect(jsonPath("$.data.pages[0].id").value("page-id-1"))
                .andExpect(jsonPath("$.data.pages[0].title").value("스터디 노트"))
                .andExpect(jsonPath("$.data.pages[0].icon").value("📚"))
                .andExpect(jsonPath("$.data.pages[1].id").value("page-id-2"))
                .andExpect(jsonPath("$.data.pages[1].title").value("프로젝트 계획"));
    }

    @Test
    @DisplayName("Notion 페이지 목록 조회 - 페이지 없음")
    void getNotionPages_empty() throws Exception {
        given(importService.getNotionPages(USER_ID, "account-abc-123")).willReturn(List.of());

        mockMvc.perform(get("/v1/imports/notion/pages")
                        .with(user(USER_ID).roles("USER"))
                        .param("integrationAccountId", "account-abc-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pages").isArray())
                .andExpect(jsonPath("$.data.pages.length()").value(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notion 가져오기 작업 생성
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Notion 가져오기 작업 생성 - COMPLETED")
    void createNotionJob_completed() throws Exception {
        ImportJobCreatedResponse response = ImportJobCreatedResponse.builder()
                .importJobId("job-001")
                .status("COMPLETED")
                .build();

        given(importService.createNotionImportJob(eq(USER_ID), any(), any())).willReturn(response);

        Map<String, String> body = Map.of(
                "integrationAccountId", "account-abc-123",
                "sourceId", "page-id-1",
                "mode", "IMPORT"
        );

        mockMvc.perform(post("/v1/imports/notion/jobs")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andDo(print())
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.importJobId").value("job-001"))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.message").value("Notion 페이지를 성공적으로 가져왔습니다."));
    }

    @Test
    @DisplayName("Notion 가져오기 작업 생성 - FAILED")
    void createNotionJob_failed() throws Exception {
        ImportJobCreatedResponse response = ImportJobCreatedResponse.builder()
                .importJobId("job-002")
                .status("FAILED")
                .build();

        given(importService.createNotionImportJob(eq(USER_ID), any(), any())).willReturn(response);

        Map<String, String> body = Map.of(
                "integrationAccountId", "account-abc-123",
                "sourceId", "page-not-exist",
                "mode", "IMPORT"
        );

        mockMvc.perform(post("/v1/imports/notion/jobs")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andDo(print())
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.message").value("Notion 가져오기에 실패했습니다."));
    }

    @Test
    @DisplayName("Notion 가져오기 작업 생성 - integrationAccountId 누락 시 400")
    void createNotionJob_missingAccountId_returns400() throws Exception {
        Map<String, String> body = Map.of("sourceId", "page-id-1"); // integrationAccountId 없음

        mockMvc.perform(post("/v1/imports/notion/jobs")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("Notion 가져오기 작업 생성 - sourceId 누락 시 400")
    void createNotionJob_missingSourceId_returns400() throws Exception {
        Map<String, String> body = Map.of("integrationAccountId", "account-abc-123"); // sourceId 없음

        mockMvc.perform(post("/v1/imports/notion/jobs")
                        .with(user(USER_ID).roles("USER"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 가져오기 작업 상태 조회
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("가져오기 작업 상태 조회 - COMPLETED")
    void getImportJobStatus_completed() throws Exception {
        ImportJobStatusResponse response = ImportJobStatusResponse.builder()
                .importJobId("job-001")
                .status("COMPLETED")
                .createdNotes(List.of(new ImportJobStatusResponse.CreatedNoteItem("note-abc", "스터디 노트")))
                .failedFiles(List.of())
                .conflicts(List.of())
                .build();

        given(importService.getImportJobStatus(USER_ID, "job-001")).willReturn(response);

        mockMvc.perform(get("/v1/imports/job-001")
                        .with(user(USER_ID).roles("USER")))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importJobId").value("job-001"))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.createdNotes[0].noteId").value("note-abc"))
                .andExpect(jsonPath("$.data.createdNotes[0].title").value("스터디 노트"));
    }

    @Test
    @DisplayName("가져오기 작업 상태 조회 - FAILED")
    void getImportJobStatus_failed() throws Exception {
        ImportJobStatusResponse response = ImportJobStatusResponse.builder()
                .importJobId("job-002")
                .status("FAILED")
                .createdNotes(List.of())
                .failedFiles(List.of(new ImportJobStatusResponse.FailedFileItem("페이지 가져오기 실패", "처리 실패")))
                .conflicts(List.of())
                .build();

        given(importService.getImportJobStatus(USER_ID, "job-002")).willReturn(response);

        mockMvc.perform(get("/v1/imports/job-002")
                        .with(user(USER_ID).roles("USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.failedFiles[0].fileName").value("페이지 가져오기 실패"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 인증 없이 접근
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("인증 없이 요청하면 401")
    void unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/imports/notion/pages")
                        .param("integrationAccountId", "account-abc-123"))
                .andExpect(status().isUnauthorized());
    }
}
