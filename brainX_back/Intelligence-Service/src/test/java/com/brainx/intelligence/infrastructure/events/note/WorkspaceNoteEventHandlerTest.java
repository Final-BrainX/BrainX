package com.brainx.intelligence.infrastructure.events.note;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteChunkDelta;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventEnvelope;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingContext;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

class WorkspaceNoteEventHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final FakeProjectionStore projectionStore = new FakeProjectionStore();
    private final FakeWorkspace workspace = new FakeWorkspace();
    private final FakeSearchIndex searchIndex = new FakeSearchIndex();
    private final FakeSummaryPort summaryPort = new FakeSummaryPort();
    private final FakeChunkManifestStore chunkManifestStore = new FakeChunkManifestStore();
    private final MarkdownNoteChunker noteChunker = new MarkdownNoteChunker();
    private final NoteIndexingService noteIndexingService = new NoteIndexingService(
        projectionStore,
        workspace,
        searchIndex,
        noteChunker,
        chunkManifestStore,
        new NoteChunkIndexPlanner()
    );
    private final WorkspaceNoteEventHandler handler = new WorkspaceNoteEventHandler(
        objectMapper,
        projectionStore,
        summaryPort,
        noteChunker,
        noteIndexingService
    );

    @Test
    void lowerVersionContentSavedIsIgnored() {
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Current",
            null,
            List.of(),
            3,
            "hash-3",
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        assertThat(workspace.requests).isZero();
        assertThat(searchIndex.savedDocuments).isEmpty();
        assertThat(summaryPort.deletedKeys).isEmpty();
        assertThat(projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow().version()).isEqualTo(3);
    }

    @Test
    void noteCreatedCreatesProjectionAndProvisionalIndex() {
        workspace.snapshot = null;

        handler.handle(context("evt-1", "NoteCreated", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","title":"Created note","folderId":"folder-1","tags":["tag-1"],"version":1}
            """));

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(projection.documentGroupId()).isEqualTo("group-1");
        assertThat(projection.title()).isEqualTo("Created note");
        assertThat(projection.contentPending()).isTrue();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.PROVISIONAL);
        assertThat(projection.markdown()).isNull();
        assertThat(projection.indexedVersion()).isEqualTo(1);
        assertThat(projection.indexedMarkdownHash()).isNull();
        assertThat(searchIndex.savedDocuments).hasSize(1);
        assertThat(searchIndex.savedDocuments.getFirst().documentGroupId()).isEqualTo("group-1");
        assertThat(searchIndex.savedDocuments.getFirst().title()).isEqualTo("Created note");
    }

    @Test
    void noteCreatedPreservesDocumentGroupIdFromPayload() {
        workspace.snapshot = null;

        handler.handle(context("evt-1", "NoteCreated", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","title":"Created note","version":1}
            """));

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(projection.documentGroupId()).isEqualTo("group-1");
        assertThat(searchIndex.savedDocuments).hasSize(1);
        assertThat(searchIndex.savedDocuments.getFirst().documentGroupId()).isEqualTo("group-1");
        assertThat(searchIndex.deletedKeys).containsExactly("user-1::group-1::note-1");
    }

    @Test
    void sameUserAndNoteIdCanBeProjectedInDifferentDocumentGroups() {
        workspace.snapshot = null;

        handler.handle(context("evt-1", "NoteCreated", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","title":"Group 1 note","version":1}
            """));
        handler.handle(context("evt-2", "NoteCreated", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-2","title":"Group 2 note","version":1}
            """));

        assertThat(projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1"))
            .get()
            .extracting(NoteProjection::title)
            .isEqualTo("Group 1 note");
        assertThat(projectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-2", "note-1"))
            .get()
            .extracting(NoteProjection::title)
            .isEqualTo("Group 2 note");
    }

    @Test
    void contentSavedFetchesSnapshotIndexesAndDeletesSummary() {
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Snapshot title",
            "# Workspace markdown summary source\n\n"
                + "first paragraph\n\n"
                + "second paragraph ".repeat(120),
            List.of("tag-1"),
            "folder-1",
            2,
            Instant.parse("2026-06-19T00:00:01Z")
        );

        handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(projection.documentGroupId()).isEqualTo("group-1");
        assertThat(projection.title()).isEqualTo("Snapshot title");
        assertThat(projection.markdownHash()).isEqualTo("hash-2");
        assertThat(projection.markdown()).contains("Workspace markdown summary source");
        assertThat(projection.contentPending()).isFalse();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.INDEXED);
        assertThat(projection.indexedVersion()).isEqualTo(2);
        assertThat(projection.indexedMarkdownHash()).isEqualTo("hash-2");
        assertThat(projection.indexedAt()).isNotNull();
        assertThat(workspace.requests).isEqualTo(1);
        assertThat(searchIndex.savedDocuments).hasSizeGreaterThan(1);
        assertThat(searchIndex.savedDocuments).allSatisfy(document ->
            assertThat(document.documentGroupId()).isEqualTo("group-1"));
        assertThat(searchIndex.savedDocuments.getFirst().excerpt()).contains("Workspace markdown summary source");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::note-1");
    }

    @Test
    void sameContentSavedDoesNotReindexAgain() {
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Current",
            null,
            List.of(),
            2,
            "hash-2",
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(2, "hash-2", Instant.parse("2026-06-19T00:00:01Z")));

        handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        assertThat(workspace.requests).isZero();
        assertThat(searchIndex.savedDocuments).isEmpty();
        assertThat(summaryPort.deletedKeys).isEmpty();
    }

    @Test
    void sameContentSavedReindexesWhenIndexStateIsNotCurrent() {
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Current",
            "updated markdown",
            List.of(),
            null,
            2,
            Instant.parse("2026-06-19T00:00:01Z")
        );
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Current",
            null,
            List.of(),
            2,
            "hash-2",
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(workspace.requests).isEqualTo(1);
        assertThat(searchIndex.savedDocuments).isNotEmpty();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.INDEXED);
        assertThat(projection.indexedVersion()).isEqualTo(2);
        assertThat(projection.indexedMarkdownHash()).isEqualTo("hash-2");
    }

    @Test
    void contentSavedAppliesDeltaWhenOnlyOneChunkChanged() {
        String oldMarkdown = longParagraph("alpha") + "\n\n"
            + longParagraph("bravo") + "\n\n"
            + longParagraph("charlie") + "\n\n"
            + longParagraph("delta");
        String newMarkdown = longParagraph("alpha") + "\n\n"
            + longParagraph("bravo changed") + "\n\n"
            + longParagraph("charlie") + "\n\n"
            + longParagraph("delta");
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Snapshot title",
            null,
            List.of(),
            1,
            "hash-1",
            oldMarkdown,
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        chunkManifestStore.replaceForNote(
            "user-1",
            "group-1",
            "note-1",
            manifests(chunks(oldMarkdown, "hash-1", 1, List.of()), 1, "hash-1")
        );
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Snapshot title",
            newMarkdown,
            List.of(),
            null,
            2,
            Instant.parse("2026-06-19T00:00:02Z")
        );

        handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        assertThat(searchIndex.deletedKeys).isEmpty();
        assertThat(searchIndex.deltas).hasSize(1);
        NoteChunkDelta delta = searchIndex.deltas.getFirst();
        assertThat(delta.upsertChunks()).hasSize(1);
        assertThat(delta.deleteChunkIds()).hasSize(1);
        assertThat(delta.payloadOnlyChunks()).hasSize(3);
        assertThat(chunkManifestStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1"))
            .hasSize(4)
            .allSatisfy(manifest -> assertThat(manifest.indexedMarkdownHash()).isEqualTo("hash-2"));
    }

    @Test
    void tagChangeUpdatesPayloadWithoutReembeddingChunks() {
        String markdown = longParagraph("alpha") + "\n\n" + longParagraph("bravo");
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Snapshot title",
            null,
            List.of(),
            1,
            "hash-1",
            markdown,
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        chunkManifestStore.replaceForNote(
            "user-1",
            "group-1",
            "note-1",
            manifests(chunks(markdown, "hash-1", 1, List.of()), 1, "hash-1")
        );
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Snapshot title",
            markdown,
            List.of("tag-1"),
            null,
            1,
            Instant.parse("2026-06-19T00:00:02Z")
        );

        handler.handle(context("evt-1", "NoteTagsChanged", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","tags":["tag-1"]}
            """));

        assertThat(searchIndex.deletedKeys).isEmpty();
        assertThat(searchIndex.savedDocuments).isEmpty();
        assertThat(searchIndex.deltas).hasSize(1);
        assertThat(searchIndex.deltas.getFirst().upsertChunks()).isEmpty();
        assertThat(searchIndex.deltas.getFirst().deleteChunkIds()).isEmpty();
        assertThat(searchIndex.deltas.getFirst().payloadOnlyChunks()).hasSize(2);
    }

    @Test
    void titleChangeForcesFullReplace() {
        String markdown = longParagraph("alpha") + "\n\n" + longParagraph("bravo");
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Old title",
            null,
            List.of(),
            1,
            "hash-1",
            markdown,
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        chunkManifestStore.replaceForNote(
            "user-1",
            "group-1",
            "note-1",
            manifests(chunks(markdown, "hash-1", 1, List.of()), 1, "hash-1")
        );
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "New title",
            markdown,
            List.of(),
            null,
            2,
            Instant.parse("2026-06-19T00:00:02Z")
        );

        handler.handle(context("evt-1", "NoteMetadataChanged", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","title":"New title","version":2}
            """));

        assertThat(searchIndex.deltas).isEmpty();
        assertThat(searchIndex.deletedKeys).containsExactly("user-1::group-1::note-1");
        assertThat(searchIndex.savedDocuments).hasSize(2);
    }

    @Test
    void deleteMarksProjectionAndRemovesIndexAndSummary() {
        projectionStore.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Current",
            null,
            List.of(),
            2,
            "hash-2",
            false,
            false,
            false,
            false,
            "evt-old",
            Instant.parse("2026-06-19T00:00:00Z")
        ));
        chunkManifestStore.replaceForNote(
            "user-1",
            "group-1",
            "note-1",
            manifests(chunks("markdown", "hash-2", 2, List.of()), 2, "hash-2")
        );

        handler.handle(context("evt-1", "NoteDeleted", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","deletedAt":"2026-06-19T00:00:00Z","permanent":true}
            """));

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(projection.deleted()).isTrue();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.REMOVED);
        assertThat(projection.indexedVersion()).isNull();
        assertThat(searchIndex.deletedKeys).containsExactly("user-1::group-1::note-1");
        assertThat(chunkManifestStore.deletedKeys).containsExactly("user-1::group-1::note-1");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::note-1");
    }

    @Test
    void indexFailureMarksProjectionAsFailedAndRethrows() {
        workspace.snapshot = new WorkspaceNotePort.NoteSnapshot(
            "note-1",
            "Snapshot title",
            "Snapshot markdown",
            List.of(),
            null,
            2,
            Instant.parse("2026-06-19T00:00:01Z")
        );
        searchIndex.failOnReplace = true;

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> handler.handle(context("evt-1", "NoteContentSaved", """
            {"noteId":"note-1","userId":"user-1","documentGroupId":"group-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """)))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("replace failed");

        NoteProjection projection = projectionStore
            .findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")
            .orElseThrow();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.FAILED);
        assertThat(chunkManifestStore.replacedKeys).isEmpty();
    }

    private static String longParagraph(String marker) {
        return (marker + " semantic content ").repeat(35);
    }

    private static List<NoteSearchDocument> chunks(
        String markdown,
        String markdownHash,
        int version,
        List<String> tags
    ) {
        return new MarkdownNoteChunker().chunk(
            "user-1",
            "group-1",
            "note-1",
            "Snapshot title",
            markdown,
            tags,
            markdownHash,
            version
        );
    }

    private static List<NoteIndexChunkManifest> manifests(
        List<NoteSearchDocument> chunks,
        int indexedVersion,
        String indexedMarkdownHash
    ) {
        return chunks.stream()
            .map(chunk -> NoteIndexChunkManifest.fromDocument(
                chunk,
                MarkdownNoteChunker.CHUNKER_VERSION,
                indexedVersion,
                indexedMarkdownHash,
                Instant.parse("2026-06-19T00:00:01Z")
            ))
            .toList();
    }

    private EventProcessingContext context(String eventId, String eventType, String payloadJson) {
        try {
            return new EventProcessingContext(new BrainxEventEnvelope(
                eventId,
                eventType,
                1,
                Instant.parse("2026-06-19T00:00:00Z"),
                "Workspace-Service",
                null,
                "user-1",
                "corr-1",
                null,
                null,
                objectMapper.readTree(payloadJson)
            ));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static final class FakeProjectionStore implements NoteProjectionStore {

        private final Map<String, NoteProjection> projections = new LinkedHashMap<>();

        public Optional<NoteProjection> findByUserIdAndNoteId(String userId, String noteId) {
            return findByUserIdAndDocumentGroupIdAndNoteId(userId, "default", noteId);
        }

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

    private static final class FakeChunkManifestStore implements NoteChunkManifestStore {

        private final Map<String, List<NoteIndexChunkManifest>> manifests = new LinkedHashMap<>();
        private final List<String> replacedKeys = new ArrayList<>();
        private final List<String> deletedKeys = new ArrayList<>();

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
            String key = key(userId, documentGroupId, noteId);
            replacedKeys.add(key);
            this.manifests.put(key, List.copyOf(manifests));
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            String key = key(userId, documentGroupId, noteId);
            deletedKeys.add(key);
            manifests.remove(key);
        }

        private static String key(String userId, String documentGroupId, String noteId) {
            return userId + "::" + documentGroupId + "::" + noteId;
        }
    }

    private static final class FakeWorkspace implements WorkspaceNotePort {

        private int requests;
        private NoteSnapshot snapshot = new NoteSnapshot(
            "note-1",
            "Snapshot title",
            "Snapshot markdown",
            List.of(),
            null,
            1,
            Instant.parse("2026-06-19T00:00:00Z")
        );

        @Override
        public NoteSnapshot getNoteSnapshot(String noteId) {
            requests++;
            return snapshot;
        }

        @Override
        public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        }
    }

    private static final class FakeSearchIndex implements NoteSearchIndexPort {

        private final List<NoteSearchDocument> savedDocuments = new ArrayList<>();
        private final List<String> deletedKeys = new ArrayList<>();
        private final List<NoteChunkDelta> deltas = new ArrayList<>();

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            savedDocuments.add(document);
            return document;
        }

        private boolean mutationApplied = true;
        private boolean failOnReplace;
        private boolean failOnDelete;

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
            deleteByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId);
            savedDocuments.addAll(chunks);
            return mutationApplied;
        }

        @Override
        public boolean applyNoteChunkDelta(String userId, String documentGroupId, String noteId, NoteChunkDelta delta) {
            if (failOnReplace) {
                throw new RuntimeException("replace failed");
            }
            deltas.add(delta);
            savedDocuments.addAll(delta.upsertChunks());
            return mutationApplied;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            if (failOnDelete) {
                throw new RuntimeException("delete failed");
            }
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return mutationApplied;
        }
    }

    private static final class FakeSummaryPort implements NoteSummaryPort {

        private final List<String> deletedKeys = new ArrayList<>();

        @Override
        public Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId) {
            return Optional.empty();
        }

        @Override
        public NoteSummary save(NoteSummary summary) {
            return summary;
        }

        @Override
        public void deleteByUserIdAndNoteId(String userId, String noteId) {
            deletedKeys.add(userId + "::" + noteId);
        }
    }
}
