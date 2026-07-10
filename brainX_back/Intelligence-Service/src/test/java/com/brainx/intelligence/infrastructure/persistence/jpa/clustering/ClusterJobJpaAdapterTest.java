package com.brainx.intelligence.infrastructure.persistence.jpa.clustering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.fasterxml.jackson.databind.ObjectMapper;

@DataJpaTest
@ActiveProfiles("test")
@Import({ClusterJobJpaAdapter.class, ClusterJobJpaAdapterTest.ObjectMapperConfig.class})
class ClusterJobJpaAdapterTest {

    @Autowired
    private ClusterJobJpaAdapter adapter;

    @Test
    void saveAndFindPreservesJsonFieldsAndIdempotencyKey() {
        ClusterJob saved = adapter.save(new ClusterJob(
            "job-1",
            "user-1",
            "group-1",
            ClusterJobStatus.COMPLETED,
            Map.of("documentGroupId", "group-1", "maxNotes", 10),
            Map.of("maxClusters", 3),
            List.of(new Cluster("cluster-1", "Backend", "summary", List.of("note-1"), List.of("Spring"), 0.92d)),
            "gpt-test",
            "idem-1",
            null,
            Instant.parse("2026-06-26T00:00:00Z"),
            Instant.parse("2026-06-26T00:00:01Z")
        ));

        assertThat(saved.clusterJobId()).isEqualTo("job-1");

        var found = adapter.findByUserIdAndClusterJobId("user-1", "job-1").orElseThrow();
        var byIdempotency = adapter.findByUserIdAndIdempotencyKey("user-1", "idem-1").orElseThrow();

        assertThat(found.documentGroupId()).isEqualTo("group-1");
        assertThat(found.scope()).containsEntry("documentGroupId", "group-1");
        assertThat(found.algorithmOptions()).containsEntry("maxClusters", 3);
        assertThat(found.clusters()).hasSize(1);
        assertThat(found.clusters().getFirst().keywords()).containsExactly("Spring");
        assertThat(byIdempotency.clusterJobId()).isEqualTo("job-1");
    }

    @Test
    void findRecentByUserIdAndDocumentGroupIdReturnsNewestJobsFirst() {
        adapter.save(job("job-old", "user-1", "group-1", Instant.parse("2026-06-26T00:00:00Z")));
        adapter.save(job("job-new", "user-1", "group-1", Instant.parse("2026-06-27T00:00:00Z")));
        adapter.save(job("job-other-group", "user-1", "group-2", Instant.parse("2026-06-28T00:00:00Z")));
        adapter.save(job("job-other-user", "user-2", "group-1", Instant.parse("2026-06-29T00:00:00Z")));

        List<ClusterJob> jobs = adapter.findRecentByUserIdAndDocumentGroupId("user-1", "group-1", 10);

        assertThat(jobs).extracting(ClusterJob::clusterJobId)
            .containsExactly("job-new", "job-old");
    }

    @Test
    void duplicateUserIdempotencyKeyIsRejectedBeforeJobExecution() {
        adapter.save(jobWithIdempotency("job-1", "idem-duplicate"));

        assertThatThrownBy(() -> adapter.save(jobWithIdempotency("job-2", "idem-duplicate")))
            .isInstanceOf(ClusteringConflictException.class)
            .hasMessageContaining("idempotency key");
    }

    private static ClusterJob jobWithIdempotency(String id, String idempotencyKey) {
        return new ClusterJob(
            id,
            "user-1",
            "group-1",
            ClusterJobStatus.RUNNING,
            Map.of("documentGroupId", "group-1"),
            Map.of("maxClusters", 3),
            List.of(),
            "gpt-test",
            idempotencyKey,
            null,
            Instant.parse("2026-07-10T00:00:00Z"),
            null
        );
    }

    private static ClusterJob job(String id, String userId, String documentGroupId, Instant createdAt) {
        return new ClusterJob(
            id,
            userId,
            documentGroupId,
            ClusterJobStatus.COMPLETED,
            Map.of("documentGroupId", documentGroupId, "maxNotes", 10),
            Map.of("maxClusters", 3),
            List.of(new Cluster("cluster-" + id, "Backend", "summary", List.of("note-1"), List.of("Spring"), 0.92d)),
            "gpt-test",
            null,
            null,
            createdAt,
            createdAt.plusSeconds(1)
        );
    }

    static class ObjectMapperConfig {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper().findAndRegisterModules();
        }
    }
}
