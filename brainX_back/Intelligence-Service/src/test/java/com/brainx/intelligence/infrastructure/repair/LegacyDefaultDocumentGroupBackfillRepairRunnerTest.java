package com.brainx.intelligence.infrastructure.repair;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.events.note.NoteChunkManifestStore;
import com.brainx.intelligence.infrastructure.events.note.NoteIndexChunkManifest;
import com.brainx.intelligence.infrastructure.events.note.NoteIndexingService;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;

class LegacyDefaultDocumentGroupBackfillRepairRunnerTest {

    @Test
    void disabledDoesNotFetchTargets() {
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-1")));
        TestFixture fixture = TestFixture.disabled(targetStore);

        fixture.runner.run(null);

        assertThat(targetStore.findCalls).isZero();
        verify(fixture.indexingService, never()).indexFromSnapshot(any(), anyInt(), any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    void enabledBackfillsDefaultOnlyProjectionToSnapshotDocumentGroupAndDeletesLegacyDefault() {
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-1")));
        TestFixture fixture = TestFixture.enabled(targetStore);
        fixture.projectionStore.save(indexedProjection("user-1", "default", "note-1"));
        fixture.workspace.snapshot = new NoteSnapshot(
            "note-1",
            "dgrp_default_user-1",
            "Snapshot title",
            "Snapshot markdown",
            List.of("tag"),
            "folder-1",
            7,
            Instant.parse("2026-07-08T00:00:00Z")
        );
        when(fixture.indexingService.indexFromSnapshot(any(), eq(0), any(), any(), eq(true), eq(true))).thenReturn(true);

        fixture.runner.run(null);

        verify(fixture.indexingService).indexFromSnapshot(
            argThat(projection -> projection.documentGroupId().equals("dgrp_default_user-1")),
            eq(0),
            any(),
            eq(repairEventId("user-1", "note-1", "dgrp_default_user-1")),
            eq(true),
            eq(true)
        );
        assertThat(fixture.searchIndex.deletedKeys).containsExactly("user-1::default::note-1");
        assertThat(fixture.chunkStore.deletedKeys).containsExactly("user-1::default::note-1");
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")).isEmpty();
    }

    @Test
    void targetExistingSkipsReindexAndDeletesLegacyDefault() {
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-1")));
        TestFixture fixture = TestFixture.enabled(targetStore);
        fixture.projectionStore.save(indexedProjection("user-1", "default", "note-1"));
        fixture.projectionStore.save(indexedProjection("user-1", "dgrp_default_user-1", "note-1"));
        fixture.workspace.snapshot = new NoteSnapshot(
            "note-1",
            "dgrp_default_user-1",
            "Snapshot title",
            "Snapshot markdown",
            List.of(),
            null,
            7,
            Instant.parse("2026-07-08T00:00:00Z")
        );

        fixture.runner.run(null);

        verify(fixture.indexingService, never()).indexFromSnapshot(any(), anyInt(), any(), any(), anyBoolean(), anyBoolean());
        assertThat(fixture.searchIndex.deletedKeys).containsExactly("user-1::default::note-1");
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")).isEmpty();
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "dgrp_default_user-1", "note-1")).isPresent();
    }

    @Test
    void snapshotFailureDoesNotDeleteLegacyDefault() {
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-1")));
        TestFixture fixture = TestFixture.enabled(targetStore);
        fixture.projectionStore.save(indexedProjection("user-1", "default", "note-1"));
        fixture.workspace.failure = new IllegalStateException("workspace down");

        fixture.runner.run(null);

        assertThat(fixture.searchIndex.deletedKeys).isEmpty();
        assertThat(fixture.chunkStore.deletedKeys).isEmpty();
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")).isPresent();
    }

    @Test
    void skippedTargetDoesNotPreventLaterTargetsInSameRun() {
        FakeTargetStore targetStore = new FakeTargetStore(List.of(
            new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-skip"),
            new LegacyDefaultDocumentGroupBackfillTarget("user-1", "note-next")
        ));
        TestFixture fixture = TestFixture.enabled(targetStore, 1);
        fixture.projectionStore.save(indexedProjection("user-1", "default", "note-skip"));
        fixture.projectionStore.save(indexedProjection("user-1", "default", "note-next"));
        fixture.workspace.snapshots.put("note-skip", new NoteSnapshot(
            "note-skip",
            "default",
            "Skip title",
            "Skip markdown",
            List.of(),
            null,
            3,
            Instant.parse("2026-07-08T00:00:00Z")
        ));
        fixture.workspace.snapshots.put("note-next", new NoteSnapshot(
            "note-next",
            "dgrp_default_user-1",
            "Next title",
            "Next markdown",
            List.of(),
            null,
            4,
            Instant.parse("2026-07-08T00:00:00Z")
        ));
        when(fixture.indexingService.indexFromSnapshot(any(), eq(0), any(), any(), eq(true), eq(true))).thenReturn(true);

        fixture.runner.run(null);

        verify(fixture.indexingService).indexFromSnapshot(
            argThat(projection -> projection.noteId().equals("note-next")),
            eq(0),
            any(),
            any(),
            eq(true),
            eq(true)
        );
        assertThat(targetStore.findCalls).isGreaterThan(1);
        assertThat(fixture.searchIndex.deletedKeys).containsExactly("user-1::default::note-next");
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-skip")).isPresent();
        assertThat(fixture.projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-next")).isEmpty();
    }

    @Test
    void backfillUsesBoundedDeterministicRepairEventIdForLongIdentifiers() {
        String userId = "user-" + "u".repeat(90);
        String noteId = "note-" + "n".repeat(90);
        String documentGroupId = "dgrp_" + "g".repeat(90);
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupBackfillTarget(userId, noteId)));
        TestFixture fixture = TestFixture.enabled(targetStore);
        fixture.projectionStore.save(indexedProjection(userId, "default", noteId));
        fixture.workspace.snapshot = new NoteSnapshot(
            noteId,
            documentGroupId,
            "Snapshot title",
            "Snapshot markdown",
            List.of(),
            null,
            7,
            Instant.parse("2026-07-08T00:00:00Z")
        );
        when(fixture.indexingService.indexFromSnapshot(any(), eq(0), any(), any(), eq(true), eq(true))).thenReturn(true);
        ArgumentCaptor<String> eventIdCaptor = ArgumentCaptor.forClass(String.class);

        fixture.runner.run(null);

        verify(fixture.indexingService).indexFromSnapshot(
            any(),
            eq(0),
            any(),
            eventIdCaptor.capture(),
            eq(true),
            eq(true)
        );
        String eventId = eventIdCaptor.getValue();
        assertThat(eventId).isEqualTo(repairEventId(userId, noteId, documentGroupId));
        assertThat(eventId).startsWith("legacy-default-document-group-backfill:");
        assertThat(eventId).hasSizeLessThanOrEqualTo(160);
    }

    private static NoteProjection indexedProjection(String userId, String documentGroupId, String noteId) {
        return new NoteProjection(
            userId,
            documentGroupId,
            noteId,
            "Title",
            "folder-1",
            List.of(),
            3,
            "hash",
            "markdown",
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-07-08T00:00:00Z")
        ).indexed(3, "hash", Instant.parse("2026-07-08T00:00:01Z"));
    }

    private static String repairEventId(String userId, String noteId, String documentGroupId) {
        return "legacy-default-document-group-backfill:" + sha256(userId + ":" + noteId + ":" + documentGroupId);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private record TestFixture(
        LegacyDefaultDocumentGroupBackfillRepairRunner runner,
        FakeProjectionStore projectionStore,
        FakeChunkStore chunkStore,
        FakeSearchIndex searchIndex,
        FakeWorkspace workspace,
        NoteIndexingService indexingService
    ) {
        static TestFixture enabled(FakeTargetStore targetStore) {
            return create(true, targetStore);
        }

        static TestFixture enabled(FakeTargetStore targetStore, int batchSize) {
            return create(true, targetStore, batchSize);
        }

        static TestFixture disabled(FakeTargetStore targetStore) {
            return create(false, targetStore);
        }

        private static TestFixture create(boolean enabled, FakeTargetStore targetStore) {
            return create(enabled, targetStore, 200);
        }

        private static TestFixture create(boolean enabled, FakeTargetStore targetStore, int batchSize) {
            LegacyDefaultDocumentGroupBackfillProperties properties = new LegacyDefaultDocumentGroupBackfillProperties();
            properties.setEnabled(enabled);
            properties.setBatchSize(batchSize);
            FakeProjectionStore projectionStore = new FakeProjectionStore();
            FakeChunkStore chunkStore = new FakeChunkStore();
            FakeSearchIndex searchIndex = new FakeSearchIndex();
            FakeWorkspace workspace = new FakeWorkspace();
            NoteIndexingService indexingService = mock(NoteIndexingService.class);
            return new TestFixture(
                new LegacyDefaultDocumentGroupBackfillRepairRunner(
                    properties,
                    targetStore,
                    projectionStore,
                    chunkStore,
                    searchIndex,
                    workspace,
                    indexingService
                ),
                projectionStore,
                chunkStore,
                searchIndex,
                workspace,
                indexingService
            );
        }
    }

    private static final class FakeTargetStore implements LegacyDefaultDocumentGroupBackfillTargetStore {

        private final List<LegacyDefaultDocumentGroupBackfillTarget> targets;
        private int findCalls;

        FakeTargetStore(List<LegacyDefaultDocumentGroupBackfillTarget> targets) {
            this.targets = targets;
        }

        @Override
        public List<LegacyDefaultDocumentGroupBackfillTarget> findDefaultOnlyProjectionTargets(int limit) {
            findCalls++;
            return targets.stream().limit(limit).toList();
        }
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
        public List<NoteProjection> findSearchableByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit) {
            return List.of();
        }

        @Override
        public List<NoteProjection> findIndexRetryCandidates(Instant now, int limit) {
            return List.of();
        }

        @Override
        public NoteProjection save(NoteProjection projection) {
            projections.put(key(projection.userId(), projection.documentGroupId(), projection.noteId()), projection);
            return projection;
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            projections.remove(key(userId, documentGroupId, noteId));
        }

        private static String key(String userId, String documentGroupId, String noteId) {
            return userId + "::" + documentGroupId + "::" + noteId;
        }
    }

    private static final class FakeChunkStore implements NoteChunkManifestStore {

        private final List<String> deletedKeys = new ArrayList<>();

        @Override
        public List<NoteIndexChunkManifest> findByUserIdAndDocumentGroupIdAndNoteId(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            return List.of();
        }

        @Override
        public void replaceForNote(
            String userId,
            String documentGroupId,
            String noteId,
            List<NoteIndexChunkManifest> manifests
        ) {
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
        }
    }

    private static final class FakeSearchIndex implements NoteSearchIndexPort {

        private final List<String> deletedKeys = new ArrayList<>();

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public boolean replaceNoteChunks(String userId, String documentGroupId, String noteId, List<NoteSearchDocument> chunks) {
            return true;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return true;
        }
    }

    private static final class FakeWorkspace implements WorkspaceNotePort {

        private final Map<String, NoteSnapshot> snapshots = new LinkedHashMap<>();
        private NoteSnapshot snapshot;
        private RuntimeException failure;

        @Override
        public NoteSnapshot getNoteSnapshot(String noteId) {
            if (failure != null) {
                throw failure;
            }
            if (snapshots.containsKey(noteId)) {
                return snapshots.get(noteId);
            }
            return snapshot;
        }

        @Override
        public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        }
    }
}
