package com.brainx.intelligence.insight.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;
import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetInsightReportUseCase.GetInsightReportQuery;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.GetLatestInsightReportQuery;
import com.brainx.intelligence.insight.application.port.inbound.GetLatestInsightReportUseCase.LatestInsightReport;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase;
import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase.InsightReportCommand;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightNotFoundException;
import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportLatestState;
import com.brainx.intelligence.insight.domain.InsightReportStatus;

@WebMvcTest(InsightController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class InsightControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RequestInsightReportUseCase requestInsightReportUseCase;

    @MockitoBean
    private GetInsightReportUseCase getInsightReportUseCase;

    @MockitoBean
    private GetLatestInsightReportUseCase getLatestInsightReportUseCase;

    @Test
    void requestInsightReportReturnsAcceptedWrappedReport() throws Exception {
        when(requestInsightReportUseCase.requestInsightReport(any(InsightReportCommand.class)))
            .thenReturn(report("report-1", InsightReportStatus.COMPLETED));

        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .header("Idempotency-Key", "idem-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": {"documentGroupId": "group-1"},
                      "includeLearningRecommendations": true
                    }
                    """))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.reportId").value("report-1"))
            .andExpect(jsonPath("$.data.status").value("COMPLETED"))
            .andExpect(jsonPath("$.data.summary").value("summary"))
            .andExpect(jsonPath("$.data.knowledgeGaps[0]").value("gap"))
            .andExpect(jsonPath("$.data.recommendations[0].type").value("CONNECT"));

        verify(requestInsightReportUseCase).requestInsightReport(argThat(command ->
            command.userId().equals("user-1")
                && command.idempotencyKey().equals("idem-1")
                && command.scope().get("documentGroupId").equals("group-1")
                && Boolean.TRUE.equals(command.includeLearningRecommendations())
        ));
    }

    @Test
    void getInsightReportReturnsWrappedReport() throws Exception {
        when(getInsightReportUseCase.getInsightReport(any(GetInsightReportQuery.class)))
            .thenReturn(report("report-1", InsightReportStatus.COMPLETED));

        mockMvc.perform(get("/api/v1/ai/insight-reports/report-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.reportId").value("report-1"))
            .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        verify(getInsightReportUseCase).getInsightReport(argThat(query ->
            query.userId().equals("user-1") && query.reportId().equals("report-1")
        ));
    }

    @Test
    void getLatestInsightReportReturnsWrappedFreshState() throws Exception {
        when(getLatestInsightReportUseCase.getLatestInsightReport(any(GetLatestInsightReportQuery.class)))
            .thenReturn(new LatestInsightReport(
                "group-1",
                2,
                Instant.parse("2026-06-26T00:00:00Z"),
                InsightReportLatestState.FRESH,
                report("report-1", InsightReportStatus.COMPLETED)
            ));

        mockMvc.perform(get("/api/v1/ai/insight-reports/latest")
                .with(user("user-1"))
                .param("documentGroupId", "group-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.searchableNoteCount").value(2))
            .andExpect(jsonPath("$.data.latestNoteUpdatedAt").value("2026-06-26T00:00:00Z"))
            .andExpect(jsonPath("$.data.state").value("FRESH"))
            .andExpect(jsonPath("$.data.report.reportId").value("report-1"))
            .andExpect(jsonPath("$.data.report.failureMessage").doesNotExist());

        verify(getLatestInsightReportUseCase).getLatestInsightReport(argThat(query ->
            query.userId().equals("user-1") && query.documentGroupId().equals("group-1")
        ));
    }

    @Test
    void getLatestInsightReportRequiresDocumentGroupAndAllowsNoReportState() throws Exception {
        when(getLatestInsightReportUseCase.getLatestInsightReport(any(GetLatestInsightReportQuery.class)))
            .thenReturn(new LatestInsightReport(
                "group-1",
                0,
                null,
                InsightReportLatestState.NO_SOURCE_NOTES,
                null
            ));

        mockMvc.perform(get("/api/v1/ai/insight-reports/latest")
                .param("documentGroupId", "group-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.searchableNoteCount").value(0))
            .andExpect(jsonPath("$.data.latestNoteUpdatedAt").doesNotExist())
            .andExpect(jsonPath("$.data.state").value("NO_SOURCE_NOTES"))
            .andExpect(jsonPath("$.data.report").doesNotExist());

        verify(getLatestInsightReportUseCase).getLatestInsightReport(argThat(query ->
            query.userId().equals("user-1") && query.documentGroupId().equals("group-1")
        ));
    }

    @Test
    void requestInsightReportRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void getLatestInsightReportRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/ai/insight-reports/latest"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void requestInsightReportRejectsMissingScope() throws Exception {
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"includeLearningRecommendations": false}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void requestInsightReportRejectsOversizedIdempotencyKey() throws Exception {
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .header("Idempotency-Key", "x".repeat(201))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {"documentGroupId": "group-1"}}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void requestInsightReportMapsDomainErrors() throws Exception {
        when(requestInsightReportUseCase.requestInsightReport(any(InsightReportCommand.class)))
            .thenThrow(new InsightForbiddenException("denied"));
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isForbidden());

        when(requestInsightReportUseCase.requestInsightReport(any(InsightReportCommand.class)))
            .thenThrow(new InsightNotFoundException("missing"));
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isNotFound());

        when(requestInsightReportUseCase.requestInsightReport(any(InsightReportCommand.class)))
            .thenThrow(new InsightConflictException("empty"));
        mockMvc.perform(post("/api/v1/ai/insight-reports")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isConflict());
    }

    private static InsightReport report(String id, InsightReportStatus status) {
        return new InsightReport(
            id,
            "user-1",
            "group-1",
            status,
            Map.of("documentGroupId", "group-1"),
            false,
            "summary",
            List.of("gap"),
            List.of(new InsightRecommendation("CONNECT", "title", "reason", List.of("note-1"), "HIGH")),
            "gpt-test",
            null,
            null,
            Instant.parse("2026-06-26T00:00:00Z"),
            Instant.parse("2026-06-26T00:00:01Z")
        );
    }
}
