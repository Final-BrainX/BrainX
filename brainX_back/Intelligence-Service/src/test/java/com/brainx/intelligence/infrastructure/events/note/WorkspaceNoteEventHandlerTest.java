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
    private final WorkspaceNoteEventHandler handler = new WorkspaceNoteEventHandler(
        objectMapper,
        projectionStore,
        workspace,
        searchIndex,
        summaryPort,
        new MarkdownNoteChunker()
    );

    @Test
    void lowerVersionContentSavedIsIgnored() {
        projectionStore.save(new NoteProjection(
            "user-1",
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
            {"noteId":"note-1","userId":"user-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        assertThat(workspace.requests).isZero();
        assertThat(searchIndex.savedDocuments).isEmpty();
        assertThat(summaryPort.deletedKeys).isEmpty();
        assertThat(projectionStore.findByUserIdAndNoteId("user-1", "note-1").orElseThrow().version()).isEqualTo(3);
    }

    @Test
    void noteCreatedCreatesProjectionAndProvisionalIndex() {
        workspace.snapshot = null;

        handler.handle(context("evt-1", "NoteCreated", """
            {"noteId":"note-1","userId":"user-1","title":"Created note","folderId":"folder-1","tags":["tag-1"],"version":1}
            """));

        NoteProjection projection = projectionStore.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();
        assertThat(projection.title()).isEqualTo("Created note");
        assertThat(projection.contentPending()).isTrue();
        assertThat(searchIndex.savedDocuments).hasSize(1);
        assertThat(searchIndex.savedDocuments.getFirst().title()).isEqualTo("Created note");
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
            {"noteId":"note-1","userId":"user-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        NoteProjection projection = projectionStore.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();
        assertThat(projection.title()).isEqualTo("Snapshot title");
        assertThat(projection.markdownHash()).isEqualTo("hash-2");
        assertThat(projection.contentPending()).isFalse();
        assertThat(workspace.requests).isEqualTo(1);
        assertThat(searchIndex.savedDocuments).hasSizeGreaterThan(1);
        assertThat(searchIndex.savedDocuments.getFirst().excerpt()).contains("Workspace markdown summary source");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::note-1");
    }

    @Test
    void sameContentSavedDoesNotReindexAgain() {
        projectionStore.save(new NoteProjection(
            "user-1",
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
            {"noteId":"note-1","userId":"user-1","version":2,"markdownHash":"hash-2","savedAt":"2026-06-19T00:00:00Z"}
            """));

        assertThat(workspace.requests).isZero();
        assertThat(searchIndex.savedDocuments).isEmpty();
        assertThat(summaryPort.deletedKeys).isEmpty();
    }

    @Test
    void deleteMarksProjectionAndRemovesIndexAndSummary() {
        projectionStore.save(new NoteProjection(
            "user-1",
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

        handler.handle(context("evt-1", "NoteDeleted", """
            {"noteId":"note-1","userId":"user-1","deletedAt":"2026-06-19T00:00:00Z","permanent":true}
            """));

        NoteProjection projection = projectionStore.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();
        assertThat(projection.deleted()).isTrue();
        assertThat(searchIndex.deletedKeys).containsExactly("user-1::note-1");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::note-1");
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

        @Override
        public Optional<NoteProjection> findByUserIdAndNoteId(String userId, String noteId) {
            return Optional.ofNullable(projections.get(key(userId, noteId)));
        }

        @Override
        public List<NoteProjection> findByUserIdAndNoteIds(String userId, List<String> noteIds) {
            return noteIds.stream()
                .map(noteId -> projections.get(key(userId, noteId)))
                .filter(java.util.Objects::nonNull)
                .toList();
        }

        @Override
        public NoteProjection save(NoteProjection projection) {
            projections.put(key(projection.userId(), projection.noteId()), projection);
            return projection;
        }

        private static String key(String userId, String noteId) {
            return userId + "::" + noteId;
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

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            savedDocuments.add(document);
            return document;
        }

        @Override
        public void replaceNoteChunks(String userId, String noteId, List<NoteSearchDocument> chunks) {
            deleteByUserIdAndNoteId(userId, noteId);
            savedDocuments.addAll(chunks);
        }

        @Override
        public void deleteByUserIdAndNoteId(String userId, String noteId) {
            deletedKeys.add(userId + "::" + noteId);
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
