package com.brainx.intelligence.infrastructure.events.folder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;
import com.brainx.intelligence.infrastructure.events.note.NoteChunkManifestStore;
import com.brainx.intelligence.infrastructure.events.note.NoteIndexChunkManifest;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.infrastructure.events.note.NoteSearchIndexStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

class FolderEventHandlerTest {

    private static final Instant NOW = Instant.parse("2026-06-28T00:00:00Z");

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final FakeFolderProjectionStore folderProjectionStore = new FakeFolderProjectionStore();
    private final FakeNoteProjectionStore noteProjectionStore = new FakeNoteProjectionStore();
    private final FakeSearchIndex searchIndex = new FakeSearchIndex();
    private final FakeChunkManifestStore chunkManifestStore = new FakeChunkManifestStore();
    private final FakeSummaryPort summaryPort = new FakeSummaryPort();
    private final FolderEventHandler handler = new FolderEventHandler(
        objectMapper,
        folderProjectionStore,
        noteProjectionStore,
        searchIndex,
        chunkManifestStore,
        summaryPort
    );

    @Test
    void storesFolderProjectionChanges() {
        handler.handle(context("evt-1", "FolderCreated", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Projects",
              "parentFolderId": "folder-root"
            }
            """));

        FolderProjection created = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        assertThat(created.name()).isEqualTo("Projects");
        assertThat(created.deleted()).isFalse();

        handler.handle(context("evt-2", "FolderChanged", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Projects 2026",
              "order": 7
            }
            """));

        FolderProjection changed = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        assertThat(changed.name()).isEqualTo("Projects 2026");
        assertThat(changed.order()).isEqualTo(7);
    }

    @Test
    void renameBeforeCreatedRetriesWithoutLosingOriginalParent() {
        EventProcessingContext rename = context("evt-rename", "FolderChanged", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Renamed"
            }
            """);

        assertThatThrownBy(() -> handler.handle(rename))
            .isInstanceOfSatisfying(EventProcessingException.class, exception -> {
                assertThat(exception.retryable()).isTrue();
                assertThat(exception.errorCode()).isEqualTo("FOLDER_PROJECTION_UNAVAILABLE");
            });

        handler.handle(context("evt-created", "FolderCreated", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Original",
              "parentFolderId": "folder-parent"
            }
            """));
        handler.handle(rename);

        FolderProjection projection = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        assertThat(projection.name()).isEqualTo("Renamed");
        assertThat(projection.parentFolderId()).isEqualTo("folder-parent");
    }

    @Test
    void completeMoveBeforeCreatedStoresProjection() {
        handler.handle(context("evt-move", "FolderChanged", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Moved",
              "parentFolderId": "folder-target",
              "order": 3
            }
            """));

        FolderProjection projection = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        assertThat(projection.name()).isEqualTo("Moved");
        assertThat(projection.parentFolderId()).isEqualTo("folder-target");
        assertThat(projection.order()).isEqualTo(3);
    }

    @Test
    void nullParentFromRenameOnlyEventPreservesCurrentParent() {
        folderProjectionStore.save(FolderProjection.created(
            "folder-1",
            "user-1",
            "Projects",
            "folder-parent",
            "evt-old",
            NOW
        ));

        handler.handle(context("evt-root", "FolderChanged", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "parentFolderId": null
            }
            """));

        assertThat(folderProjectionStore.findByFolderId("folder-1").orElseThrow().parentFolderId())
            .isEqualTo("folder-parent");
    }

    @Test
    void blankParentMovesFolderToWorkspaceRoot() {
        folderProjectionStore.save(FolderProjection.created(
            "folder-1",
            "user-1",
            "Projects",
            "folder-parent",
            "evt-old",
            NOW
        ));

        handler.handle(context("evt-root", "FolderChanged", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "parentFolderId": ""
            }
            """));

        assertThat(folderProjectionStore.findByFolderId("folder-1").orElseThrow().parentFolderId()).isNull();
    }

    @Test
    void lateFolderCreatedDoesNotResurrectDeletedProjection() {
        folderProjectionStore.save(
            FolderProjection.created("folder-1", "user-1", "Projects", null, "evt-created", NOW)
                .deleted("PERMANENT", null, "evt-deleted", NOW.plusSeconds(1))
        );

        handler.handle(context("evt-created-late", "FolderCreated", """
            {
              "folderId": "folder-1",
              "userId": "user-1",
              "documentGroupId": "group-1",
              "name": "Stale name",
              "parentFolderId": null
            }
            """));

        FolderProjection projection = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        assertThat(projection.deleted()).isTrue();
        assertThat(projection.name()).isEqualTo("Projects");
    }

    @Test
    void folderDeletedTrashPayloadDeletesFoldersAndTrashesNotes() {
        folderProjectionStore.save(FolderProjection.created("folder-1", "user-1", "Projects", null, "evt-old", NOW));
        noteProjectionStore.save(indexedProjection("note-1"));
        noteProjectionStore.save(indexedProjection("note-2"));

        handler.handle(context("evt-3", "FolderDeleted", """
            {
              "userId": "user-1",
              "documentGroupId": "group-1",
              "folderIds": ["folder-1", "folder-child"],
              "mode": "trash",
              "noteIds": ["note-1", "note-2"]
            }
            """));

        assertThat(folderProjectionStore.findByFolderId("folder-1").orElseThrow().deleted()).isTrue();
        assertThat(folderProjectionStore.findByFolderId("folder-child").orElseThrow().deleted()).isTrue();
        assertThat(folderProjectionStore.findByFolderId("folder-1").orElseThrow().childNoteAction()).isEqualTo("TRASH");

        NoteProjection note1 = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1").orElseThrow();
        NoteProjection note2 = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-2").orElseThrow();
        assertThat(note1.trashed()).isTrue();
        assertThat(note2.trashed()).isTrue();
        assertThat(note1.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.REMOVED);
        assertThat(searchIndex.deletedKeys).containsExactly("user-1::group-1::note-1", "user-1::group-1::note-2");
        assertThat(chunkManifestStore.deletedKeys).containsExactly("user-1::group-1::note-1", "user-1::group-1::note-2");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::group-1::note-1", "user-1::group-1::note-2");
    }

    @Test
    void folderDeletedPermanentPayloadMarksNotesDeleted() {
        noteProjectionStore.save(indexedProjection("note-1"));

        handler.handle(context("evt-4", "FolderDeleted", """
            {
              "userId": "user-1",
              "documentGroupId": "group-1",
              "folderIds": ["folder-1"],
              "mode": "permanent",
              "noteIds": ["note-1"]
            }
            """));

        FolderProjection deletedFolder = folderProjectionStore.findByFolderId("folder-1").orElseThrow();
        NoteProjection deletedNote = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1").orElseThrow();
        assertThat(deletedFolder.childNoteAction()).isEqualTo("PERMANENT");
        assertThat(deletedNote.deleted()).isTrue();
        assertThat(deletedNote.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.REMOVED);
    }

    @Test
    void emptyFolderDeletionAcceptsEmptyNoteIds() {
        handler.handle(context("evt-empty", "FolderDeleted", """
            {
              "userId": "user-1",
              "documentGroupId": "group-1",
              "folderIds": ["folder-empty"],
              "mode": "trash",
              "noteIds": []
            }
            """));

        FolderProjection projection = folderProjectionStore.findByFolderId("folder-empty").orElseThrow();
        assertThat(projection.deleted()).isTrue();
        assertThat(searchIndex.deletedKeys).isEmpty();
    }

    @Test
    void indexDeleteFalseKeepsProjectionStateWithoutRemovedStatus() {
        searchIndex.mutationApplied = false;
        noteProjectionStore.save(indexedProjection("note-1"));

        handler.handle(context("evt-5", "FolderDeleted", """
            {
              "userId": "user-1",
              "documentGroupId": "group-1",
              "folderIds": ["folder-1"],
              "mode": "trash",
              "noteIds": ["note-1"]
            }
            """));

        NoteProjection projection = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1").orElseThrow();
        assertThat(projection.trashed()).isTrue();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.STALE);
        assertThat(chunkManifestStore.deletedKeys).containsExactly("user-1::group-1::note-1");
        assertThat(summaryPort.deletedKeys).containsExactly("user-1::group-1::note-1");
    }

    @Test
    void folderDeletedRejectsInvalidPayloads() {
        assertThatThrownBy(() -> handler.handle(context("evt-6", "FolderDeleted", """
            {"userId":"user-1","documentGroupId":"group-1","folderIds":[],"mode":"trash","noteIds":["note-1"]}
            """)))
            .isInstanceOf(EventProcessingException.class)
            .hasMessageContaining("folderIds must not be empty");

        assertThatThrownBy(() -> handler.handle(context("evt-7", "FolderDeleted", """
            {"userId":"user-1","documentGroupId":"group-1","folderIds":["folder-1"],"mode":"move","noteIds":["note-1"]}
            """)))
            .isInstanceOf(EventProcessingException.class)
            .hasMessageContaining("mode must be trash or permanent");

        assertThatThrownBy(() -> handler.handle(context("evt-8", "FolderDeleted", """
            {"userId":"user-1","documentGroupId":"group-1","folderIds":["folder-1"],"mode":"trash"}
            """)))
            .isInstanceOf(EventProcessingException.class)
            .hasMessageContaining("noteIds must not be empty");
    }

    private static NoteProjection indexedProjection(String noteId) {
        return new NoteProjection(
            "user-1",
            "group-1",
            noteId,
            "Title",
            "folder-1",
            List.of(),
            2,
            "hash-2",
            "markdown",
            false,
            false,
            false,
            false,
            "evt-old",
            NOW
        ).indexed(2, "hash-2", NOW);
    }

    private EventProcessingContext context(String eventId, String eventType, String payloadJson) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("occurredAt", "2026-06-28T00:00:00Z");
        envelope.put("producer", "Workspace-Service");
        envelope.put("tenantId", null);
        envelope.put("userId", "user-1");
        envelope.put("correlationId", eventId);
        envelope.put("causationId", null);
        envelope.put("idempotencyKey", eventId);
        try {
            envelope.put("payload", objectMapper.readTree(payloadJson));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to parse test payload.", exception);
        }
        return new EventProcessingContext(objectMapper.convertValue(envelope, BrainxEventEnvelope.class));
    }

    private static final class FakeFolderProjectionStore implements FolderProjectionStore {

        private final Map<String, FolderProjection> projections = new LinkedHashMap<>();

        @Override
        public Optional<FolderProjection> findByFolderId(String folderId) {
            return Optional.ofNullable(projections.get(folderId));
        }

        @Override
        public FolderProjection save(FolderProjection projection) {
            projections.put(projection.folderId(), projection);
            return projection;
        }
    }

    private static final class FakeNoteProjectionStore implements NoteProjectionStore {

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

    private static final class FakeSearchIndex implements NoteSearchIndexPort {

        private final List<String> deletedKeys = new ArrayList<>();
        private boolean mutationApplied = true;

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
            return mutationApplied;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return mutationApplied;
        }
    }

    private static final class FakeChunkManifestStore implements NoteChunkManifestStore {

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

    private static final class FakeSummaryPort implements NoteSummaryPort {

        private final List<String> deletedKeys = new ArrayList<>();

        @Override
        public Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId) {
            return Optional.empty();
        }

        @Override
        public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            return Optional.empty();
        }

        @Override
        public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHash(
            String userId,
            String documentGroupId,
            String noteId,
            String markdownHash
        ) {
            return Optional.empty();
        }

        @Override
        public NoteSummary save(NoteSummary summary) {
            return summary;
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
        }

        @Override
        public void deleteByUserIdAndNoteId(String userId, String noteId) {
            deletedKeys.add(userId + "::" + noteId);
        }
    }
}
