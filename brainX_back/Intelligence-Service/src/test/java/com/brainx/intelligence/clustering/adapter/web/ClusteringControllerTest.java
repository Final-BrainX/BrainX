package com.brainx.intelligence.clustering.adapter.web;

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

import com.brainx.intelligence.clustering.application.port.inbound.GetClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetClusterJobUseCase.GetClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.GetLatestClusterJobQuery;
import com.brainx.intelligence.clustering.application.port.inbound.GetLatestClusterJobUseCase.LatestClusterJob;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase;
import com.brainx.intelligence.clustering.application.port.inbound.RequestClusterJobUseCase.ClusterJobCommand;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobLatestState;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.brainx.intelligence.clustering.domain.ClusteringForbiddenException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

@WebMvcTest(ClusteringController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class ClusteringControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private RequestClusterJobUseCase requestClusterJobUseCase;

    @MockitoBean
    private GetClusterJobUseCase getClusterJobUseCase;

    @MockitoBean
    private GetLatestClusterJobUseCase getLatestClusterJobUseCase;

    @Test
    void requestClusterJobReturnsAcceptedWrappedJob() throws Exception {
        when(requestClusterJobUseCase.requestClusterJob(any(ClusterJobCommand.class)))
            .thenReturn(job("job-1", ClusterJobStatus.COMPLETED));

        mockMvc.perform(post("/api/v1/ai/clusters")
                .with(user("user-1"))
                .header("Idempotency-Key", "idem-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": {"documentGroupId": "group-1"},
                      "algorithmOptions": {"maxClusters": 3}
                    }
                    """))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.clusterJobId").value("job-1"))
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.status").value("COMPLETED"))
            .andExpect(jsonPath("$.data.createdAt").value("2026-06-26T00:00:00Z"))
            .andExpect(jsonPath("$.data.completedAt").value("2026-06-26T00:00:01Z"))
            .andExpect(jsonPath("$.data.clusters[0].clusterId").value("cluster-1"))
            .andExpect(jsonPath("$.data.clusters[0].noteIds[0]").value("note-1"));

        verify(requestClusterJobUseCase).requestClusterJob(argThat(command ->
            command.userId().equals("user-1")
                && command.idempotencyKey().equals("idem-1")
                && command.scope().get("documentGroupId").equals("group-1")
                && command.algorithmOptions().get("maxClusters").equals(3)
        ));
    }

    @Test
    void getClusterJobReturnsWrappedJob() throws Exception {
        when(getClusterJobUseCase.getClusterJob(any(GetClusterJobQuery.class)))
            .thenReturn(job("job-1", ClusterJobStatus.COMPLETED));

        mockMvc.perform(get("/api/v1/ai/clusters/job-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.clusterJobId").value("job-1"))
            .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        verify(getClusterJobUseCase).getClusterJob(argThat(query ->
            query.userId().equals("user-1") && query.clusterJobId().equals("job-1")
        ));
    }

    @Test
    void getLatestClusterJobReturnsWrappedFreshState() throws Exception {
        when(getLatestClusterJobUseCase.getLatestClusterJob(any(GetLatestClusterJobQuery.class)))
            .thenReturn(new LatestClusterJob(
                "group-1",
                7,
                Instant.parse("2026-06-26T00:00:00Z"),
                ClusterJobLatestState.FRESH,
                job("job-1", ClusterJobStatus.COMPLETED)
            ));

        mockMvc.perform(get("/api/v1/ai/clusters/latest")
                .queryParam("documentGroupId", "group-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.searchableNoteCount").value(7))
            .andExpect(jsonPath("$.data.latestNoteUpdatedAt").value("2026-06-26T00:00:00Z"))
            .andExpect(jsonPath("$.data.state").value("FRESH"))
            .andExpect(jsonPath("$.data.job.clusterJobId").value("job-1"));

        verify(getLatestClusterJobUseCase).getLatestClusterJob(argThat(query ->
            query.userId().equals("user-1") && query.documentGroupId().equals("group-1")
        ));
    }

    @Test
    void getLatestClusterJobReturnsNoJobStates() throws Exception {
        for (ClusterJobLatestState state : List.of(
            ClusterJobLatestState.NO_SOURCE_NOTES,
            ClusterJobLatestState.NOT_ANALYZED,
            ClusterJobLatestState.STALE,
            ClusterJobLatestState.FAILED
        )) {
            when(getLatestClusterJobUseCase.getLatestClusterJob(any(GetLatestClusterJobQuery.class)))
                .thenReturn(new LatestClusterJob("group-1", 0, null, state, null));

            mockMvc.perform(get("/api/v1/ai/clusters/latest")
                    .queryParam("documentGroupId", "group-1")
                    .with(user("user-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.state").value(state.name()))
                .andExpect(jsonPath("$.data.job").doesNotExist());
        }
    }

    @Test
    void requestClusterJobRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/clusters")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void requestClusterJobRejectsMissingScope() throws Exception {
        mockMvc.perform(post("/api/v1/ai/clusters")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"algorithmOptions": {}}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void requestClusterJobMapsDomainErrors() throws Exception {
        when(requestClusterJobUseCase.requestClusterJob(any(ClusterJobCommand.class)))
            .thenThrow(new ClusteringForbiddenException("denied"));
        mockMvc.perform(post("/api/v1/ai/clusters")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isForbidden());

        when(requestClusterJobUseCase.requestClusterJob(any(ClusterJobCommand.class)))
            .thenThrow(new ClusteringNotFoundException("missing"));
        mockMvc.perform(post("/api/v1/ai/clusters")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isNotFound());

        when(requestClusterJobUseCase.requestClusterJob(any(ClusterJobCommand.class)))
            .thenThrow(new ClusteringConflictException("empty"));
        mockMvc.perform(post("/api/v1/ai/clusters")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"scope": {}}
                    """))
            .andExpect(status().isConflict());
    }

    private static ClusterJob job(String id, ClusterJobStatus status) {
        return new ClusterJob(
            id,
            "user-1",
            "group-1",
            status,
            Map.of("documentGroupId", "group-1"),
            Map.of("maxClusters", 3),
            List.of(new Cluster("cluster-1", "Backend", "summary", List.of("note-1"), List.of("Spring"), 0.9d)),
            "gpt-test",
            null,
            null,
            Instant.parse("2026-06-26T00:00:00Z"),
            Instant.parse("2026-06-26T00:00:01Z")
        );
    }
}
