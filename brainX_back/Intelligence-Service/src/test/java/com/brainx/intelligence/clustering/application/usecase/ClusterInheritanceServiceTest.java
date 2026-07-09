package com.brainx.intelligence.clustering.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.clustering.application.port.inbound.InheritClusterUseCase.ClusterInheritanceCommand;
import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringNoteSourcePort;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

class ClusterInheritanceServiceTest {

    @Test
    void sameSourceClusterCreatesDurableSnapshotAndBackfillsProjectionLag() {
        FakeStore store = new FakeStore();
        store.jobs.add(baseline());
        FakeEvents events = new FakeEvents();
        ClusteringNoteSourcePort notes = new ClusteringNoteSourcePort() {
            @Override
            public List<KnowledgeAnalysisNote> findClusteringSourceNotes(String userId, String documentGroupId, int limit) {
                return List.of(note("note-1"), note("note-2"));
            }

            @Override
            public List<KnowledgeAnalysisNote> findClusteringSourceNotesByIds(
                String userId,
                String documentGroupId,
                List<String> noteIds
            ) {
                return List.of();
            }
        };
        WorkspaceNotePort workspace = new WorkspaceNotePort() {
            @Override
            public NoteSnapshot getNoteSnapshot(String noteId) {
                return new NoteSnapshot(
                    noteId,
                    "group-1",
                    "Bridge",
                    "# Bridge\ncontent",
                    List.of("bridge"),
                    null,
                    1,
                    Instant.parse("2026-07-10T00:00:00Z"),
                    "user-1"
                );
            }

            @Override
            public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
            }
        };
        ClusterInheritanceService service = new ClusterInheritanceService(
            store,
            notes,
            workspace,
            events,
            new ClusteringProperties(),
            Clock.fixed(Instant.parse("2026-07-10T00:00:00Z"), ZoneOffset.UTC)
        );

        var result = service.inheritCluster(new ClusterInheritanceCommand(
            "user-1",
            "group-1",
            "bridge-1",
            List.of("note-1", "note-2")
        ));

        assertThat(result.inherited()).isTrue();
        assertThat(result.clusterId()).isEqualTo("cluster-1");
        ClusterJob latest = store.jobs.getLast();
        assertThat(latest.clusters().getFirst().noteIds()).containsExactly("note-1", "note-2", "bridge-1");
        assertThat(latest.algorithmOptions()).containsEntry("mode", "BRIDGE_INHERITANCE");
        assertThat(latest.scope().toString()).contains("bridge-1");
        assertThat(events.requested).isEqualTo(1);
        assertThat(events.completed).isEqualTo(1);
    }

    @Test
    void differentSourceClustersRemainUnassignedWithoutWorkspaceCall() {
        FakeStore store = new FakeStore();
        ClusterJob baseline = baseline();
        store.jobs.add(new ClusterJob(
            baseline.clusterJobId(),
            baseline.userId(),
            baseline.documentGroupId(),
            baseline.status(),
            baseline.scope(),
            baseline.algorithmOptions(),
            List.of(
                new Cluster("cluster-1", "One", "", List.of("note-1"), List.of(), 0.9d),
                new Cluster("cluster-2", "Two", "", List.of("note-2"), List.of(), 0.9d)
            ),
            baseline.modelId(),
            baseline.idempotencyKey(),
            baseline.failureMessage(),
            baseline.createdAt(),
            baseline.completedAt()
        ));
        WorkspaceNotePort workspace = new WorkspaceNotePort() {
            @Override
            public NoteSnapshot getNoteSnapshot(String noteId) {
                throw new AssertionError("Workspace must not be called when sources differ.");
            }

            @Override
            public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
            }
        };
        ClusterInheritanceService service = new ClusterInheritanceService(
            store,
            emptyNotes(),
            workspace,
            new FakeEvents(),
            new ClusteringProperties(),
            Clock.systemUTC()
        );

        var result = service.inheritCluster(new ClusterInheritanceCommand(
            "user-1", "group-1", "bridge-1", List.of("note-1", "note-2")
        ));

        assertThat(result.inherited()).isFalse();
        assertThat(store.jobs).hasSize(1);
    }

    private static ClusterJob baseline() {
        return new ClusterJob(
            "job-1",
            "user-1",
            "group-1",
            ClusterJobStatus.COMPLETED,
            Map.of("documentGroupId", "group-1"),
            Map.of("maxClusters", 6),
            List.of(new Cluster("cluster-1", "Backend", "", List.of("note-1", "note-2"), List.of(), 0.9d)),
            "gpt-test",
            null,
            null,
            Instant.parse("2026-07-09T00:00:00Z"),
            Instant.parse("2026-07-09T00:00:01Z")
        );
    }

    private static KnowledgeAnalysisNote note(String noteId) {
        return new KnowledgeAnalysisNote(
            "user-1", "group-1", noteId, noteId, List.of(), List.of(), noteId,
            Instant.parse("2026-07-09T00:00:00Z")
        );
    }

    private static ClusteringNoteSourcePort emptyNotes() {
        return new ClusteringNoteSourcePort() {
            @Override
            public List<KnowledgeAnalysisNote> findClusteringSourceNotes(String userId, String documentGroupId, int limit) {
                return List.of();
            }

            @Override
            public List<KnowledgeAnalysisNote> findClusteringSourceNotesByIds(
                String userId,
                String documentGroupId,
                List<String> noteIds
            ) {
                return List.of();
            }
        };
    }

    private static final class FakeStore implements ClusterJobStore {
        private final List<ClusterJob> jobs = new ArrayList<>();

        @Override
        public ClusterJob save(ClusterJob job) {
            jobs.removeIf(existing -> existing.clusterJobId().equals(job.clusterJobId()));
            jobs.add(job);
            return job;
        }

        @Override
        public Optional<ClusterJob> findByUserIdAndClusterJobId(String userId, String clusterJobId) {
            return Optional.empty();
        }

        @Override
        public Optional<ClusterJob> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey) {
            return Optional.empty();
        }

        @Override
        public List<ClusterJob> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit) {
            return jobs.reversed().stream().limit(limit).toList();
        }
    }

    private static final class FakeEvents implements ClusteringEventPort {
        private int requested;
        private int completed;

        @Override
        public void clusterJobRequested(ClusterJobRequestedEvent event) {
            requested++;
        }

        @Override
        public void clusterJobCompleted(ClusterJobCompletedEvent event) {
            completed++;
        }
    }
}
