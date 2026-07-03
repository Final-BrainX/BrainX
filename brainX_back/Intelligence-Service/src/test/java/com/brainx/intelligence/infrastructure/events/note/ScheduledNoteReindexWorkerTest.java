package com.brainx.intelligence.infrastructure.events.note;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteChunkDelta;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.workspace.WorkspaceNoteAdapterException;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;

class ScheduledNoteReindexWorkerTest {

    private static final Instant NOW = Instant.parse("2026-07-03T01:00:00Z");

    private final FakeProjectionStore projectionStore = new FakeProjectionStore();
    private final FakeWorkspace workspace = new FakeWorkspace();
    private final FakeSearchIndex searchIndex = new FakeSearchIndex();
    private final FakeChunkManifestStore chunkManifestStore = new FakeChunkManifestStore();
    private final NoteIndexRetryProperties properties = new NoteIndexRetryProperties();
    private final NoteIndexingService indexingService = new NoteIndexingService(
        projectionStore,
        workspace,
        searchIndex,
        new MarkdownNoteChunker(),
        chunkManifestStore,
        new NoteChunkIndexPlanner()
    );
    private final ScheduledNoteReindexWorker worker = new ScheduledNoteReindexWorker(
        projectionStore,
        indexingService,
        properties
    );

    @Test
    void provisionalProjectionIsIndexedFromSnapshot() {
        NoteProjection projection = activeProjection("note-1")
            .provisionallyIndexed(1, Instant.parse("2026-07-03T00:00:00Z"));
        projectionStore.save(projection);
        workspace.snapshot = new NoteSnapshot(
            "note-1",
            "default",
            "Snapshot title",
            "# Snapshot\n\nmarkdown body for retry indexing",
            List.of("tag-1"),
            "folder-1",
            1,
            NOW
        );

        int processed = worker.runOnce(NOW);

        NoteProjection updated = projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")
            .orElseThrow();
        assertThat(processed).isEqualTo(1);
        assertThat(updated.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.INDEXED);
        assertThat(updated.contentPending()).isFalse();
        assertThat(updated.markdown()).contains("markdown body");
        assertThat(updated.indexedVersion()).isEqualTo(1);
        assertThat(updated.indexAttemptCount()).isZero();
        assertThat(searchIndex.replacedKeys).containsExactly("user-1::default::note-1");
        assertThat(chunkManifestStore.replacedKeys).containsExactly("user-1::default::note-1");
    }

    @Test
    void snapshotUnavailableSchedulesBackoffWithoutMarkingFailed() {
        projectionStore.save(activeProjection("note-1").provisionallyIndexed(1, Instant.parse("2026-07-03T00:00:00Z")));
        workspace.fail = true;

        int processed = worker.runOnce(NOW);

        NoteProjection updated = projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")
            .orElseThrow();
        assertThat(processed).isEqualTo(1);
        assertThat(updated.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.PROVISIONAL);
        assertThat(updated.indexAttemptCount()).isEqualTo(1);
        assertThat(updated.lastIndexAttemptAt()).isEqualTo(NOW);
        assertThat(updated.nextIndexRetryAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(updated.lastIndexErrorCode()).isEqualTo("SNAPSHOT_UNAVAILABLE");
    }

    @Test
    void indexPortFailureMarksFailedAndSchedulesBackoff() {
        projectionStore.save(activeProjection("note-1"));
        workspace.snapshot = new NoteSnapshot(
            "note-1",
            "Snapshot title",
            "retry markdown",
            List.of(),
            null,
            1,
            NOW
        );
        searchIndex.failOnReplace = true;

        int processed = worker.runOnce(NOW);

        NoteProjection updated = projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")
            .orElseThrow();
        assertThat(processed).isEqualTo(1);
        assertThat(updated.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.FAILED);
        assertThat(updated.indexAttemptCount()).isEqualTo(1);
        assertThat(updated.nextIndexRetryAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(updated.lastIndexErrorCode()).isEqualTo("INDEX_RETRY_FAILED");
        assertThat(updated.lastIndexErrorMessage()).contains("replace failed");
    }

    @Test
    void maxAttemptsDefersForOneDayWithoutCallingWorkspace() {
        NoteProjection projection = activeProjection("note-1");
        for (int attempt = 0; attempt < properties.getMaxAttempts(); attempt++) {
            projection = projection.withIndexRetryFailure(
                "evt-" + attempt,
                NOW.minusSeconds(60),
                NOW.minusSeconds(1),
                "INDEX_RETRY_FAILED",
                "failed",
                true
            );
        }
        projectionStore.save(projection);

        int processed = worker.runOnce(NOW);

        NoteProjection updated = projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")
            .orElseThrow();
        assertThat(processed).isZero();
        assertThat(workspace.requests).isZero();
        assertThat(updated.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.FAILED);
        assertThat(updated.indexAttemptCount()).isEqualTo(properties.getMaxAttempts());
        assertThat(updated.nextIndexRetryAt()).isEqualTo(NOW.plusSeconds(86_400));
    }

    private static NoteProjection activeProjection(String noteId) {
        return new NoteProjection(
            "user-1",
            "default",
            noteId,
            "Title",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-07-03T00:00:00Z")
        );
    }

    private static final class FakeProjectionStore implements NoteProjectionStore {

        private final Map<String, NoteProjection> projections = new LinkedHashMap<>();

        @Override
        public Optional<NoteProjection> findByUserIdAndDocumentGroupIdAndNoteId(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            return Optional.ofNullable(projections.get(key(userId, documentGroupId, noteId)));
        }

        @Override
        public List<NoteProjection> findByUserIdAndDocumentGroupIdAndNoteIds(
            String userId,
            String documentGroupId,
            List<String> noteIds
        ) {
            return noteIds.stream()
                .map(noteId -> projections.get(key(userId, documentGroupId, noteId)))
                .filter(java.util.Objects::nonNull)
                .toList();
        }

        @Override
        public List<NoteProjection> findSearchableByUserIdAndDocumentGroupId(
            String userId,
            String documentGroupId,
            int limit
        ) {
            return projections.values().stream()
                .filter(projection -> projection.userId().equals(userId))
                .filter(projection -> projection.documentGroupId().equals(documentGroupId))
                .filter(projection -> projection.searchable())
                .filter(projection -> !projection.contentPending())
                .filter(projection -> projection.markdown() != null)
                .filter(projection -> projection.searchIndexStatus() == NoteSearchIndexStatus.INDEXED)
                .limit(limit)
                .toList();
        }

        @Override
        public List<NoteProjection> findIndexRetryCandidates(Instant now, int limit) {
            return projections.values().stream()
                .filter(NoteProjection::searchable)
                .filter(projection -> projection.contentPending()
                    || projection.searchIndexStatus() == NoteSearchIndexStatus.NOT_INDEXED
                    || projection.searchIndexStatus() == NoteSearchIndexStatus.PROVISIONAL
                    || projection.searchIndexStatus() == NoteSearchIndexStatus.STALE
                    || projection.searchIndexStatus() == NoteSearchIndexStatus.FAILED)
                .filter(projection -> projection.nextIndexRetryAt() == null || !projection.nextIndexRetryAt().isAfter(now))
                .sorted(Comparator
                    .comparing((NoteProjection projection) -> projection.nextIndexRetryAt() == null ? 0 : 1)
                    .thenComparing(projection -> projection.nextIndexRetryAt() == null ? Instant.EPOCH : projection.nextIndexRetryAt())
                    .thenComparing(NoteProjection::updatedAt, Comparator.reverseOrder()))
                .limit(limit)
                .toList();
        }

        @Override
        public NoteProjection save(NoteProjection projection) {
            projections.put(key(projection.userId(), projection.documentGroupId(), projection.noteId()), projection);
            return projection;
        }

        private static String key(String userId, String documentGroupId, String noteId) {
            return userId + "::" + documentGroupId + "::" + noteId;
        }
    }

    private static final class FakeWorkspace implements WorkspaceNotePort {

        private int requests;
        private boolean fail;
        private NoteSnapshot snapshot;

        @Override
        public NoteSnapshot getNoteSnapshot(String noteId) {
            requests++;
            if (fail) {
                throw new WorkspaceNoteAdapterException("workspace unavailable");
            }
            return snapshot;
        }

        @Override
        public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        }
    }

    private static final class FakeSearchIndex implements NoteSearchIndexPort {

        private final List<String> replacedKeys = new ArrayList<>();
        private boolean failOnReplace;

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public boolean replaceNoteChunks(
            String userId,
            String documentGroupId,
            String noteId,
            List<NoteSearchDocument> chunks
        ) {
            if (failOnReplace) {
                throw new RuntimeException("replace failed");
            }
            replacedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return true;
        }

        @Override
        public boolean applyNoteChunkDelta(String userId, String documentGroupId, String noteId, NoteChunkDelta delta) {
            if (failOnReplace) {
                throw new RuntimeException("replace failed");
            }
            replacedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return true;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            return true;
        }
    }

    private static final class FakeChunkManifestStore implements NoteChunkManifestStore {

        private final Map<String, List<NoteIndexChunkManifest>> manifests = new LinkedHashMap<>();
        private final List<String> replacedKeys = new ArrayList<>();

        @Override
        public List<NoteIndexChunkManifest> findByUserIdAndDocumentGroupIdAndNoteId(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            return manifests.getOrDefault(key(userId, documentGroupId, noteId), List.of());
        }

        @Override
        public void replaceForNote(
            String userId,
            String documentGroupId,
            String noteId,
            List<NoteIndexChunkManifest> manifests
        ) {
            replacedKeys.add(key(userId, documentGroupId, noteId));
            this.manifests.put(key(userId, documentGroupId, noteId), List.copyOf(manifests));
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            manifests.remove(key(userId, documentGroupId, noteId));
        }

        private static String key(String userId, String documentGroupId, String noteId) {
            return userId + "::" + documentGroupId + "::" + noteId;
        }
    }
}
