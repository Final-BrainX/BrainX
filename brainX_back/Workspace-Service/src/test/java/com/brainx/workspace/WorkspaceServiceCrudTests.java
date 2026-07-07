package com.brainx.workspace;

import com.brainx.workspace.dto.ApiResponse;
import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.repository.*;
import com.brainx.workspace.service.WorkspaceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import org.neo4j.driver.Driver;
import org.neo4j.driver.SessionConfig;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class WorkspaceServiceCrudTests {
    private static final String USER_ID = "usr_test";

    @Autowired(required = false)
    Driver neo4jDriver;

    @Autowired
    WorkspaceService workspaceService;
    @Autowired
    NoteLinkRepository noteLinkRepository;
    @Autowired
    FavoriteRepository favoriteRepository;
    @Autowired
    RecentActivityRepository recentActivityRepository;
    @Autowired
    NoteVersionRepository noteVersionRepository;
    @Autowired
    ShareLinkRepository shareLinkRepository;
    @Autowired
    GraphLayoutRepository graphLayoutRepository;
    @Autowired
    EventOutboxRepository eventOutboxRepository;
    @Autowired
    FolderRepository folderRepository;
    @Autowired
    NoteRepository noteRepository;
    @Autowired
    WorkspaceRepository workspaceRepository;
    @Autowired
    ObjectMapper objectMapper;

    @BeforeEach
    void cleanDatabase() {
        noteLinkRepository.deleteAll();
        favoriteRepository.deleteAll();
        recentActivityRepository.deleteAll();
        noteVersionRepository.deleteAll();
        shareLinkRepository.deleteAll();
        graphLayoutRepository.deleteAll();
        eventOutboxRepository.deleteAll();
        folderRepository.deleteAll();
        noteRepository.deleteAll();
        workspaceRepository.deleteAll();
        if (neo4jDriver != null) {
            try (var session = neo4jDriver.session()) {
                session.executeWrite(tx -> tx.run("MATCH (n) DETACH DELETE n").consume());
            } catch (Exception e) {
                System.err.println("Failed to clean Neo4j database: " + e.getMessage());
            }
        }
    }

    @Test
    void noteFolderLinkGraphAndDeleteCrudFollowWorkspaceContract() {
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "Study", null));
        NoteCreatedData first = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "First note", "hello", folder.folderId(), List.of("java")));
        NoteCreatedData second = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Second note", "target", folder.folderId(), List.of("graph")));
        String defaultDocumentGroupId = "dgrp_default_" + USER_ID;

        assertThat(folder.documentGroupId()).isEqualTo(defaultDocumentGroupId);
        assertThat(first.documentGroupId()).isEqualTo(defaultDocumentGroupId);
        assertThat(second.documentGroupId()).isEqualTo(defaultDocumentGroupId);

        NoteDetailData detail = workspaceService.getNote(USER_ID, first.noteId());
        assertThat(detail.documentGroupId()).isEqualTo(defaultDocumentGroupId);
        assertThat(detail.title()).isEqualTo("First note");
        assertThat(detail.folder().folderId()).isEqualTo(folder.folderId());
        assertThat(detail.version()).isEqualTo(1);

        NoteContentSaveData saved = workspaceService.saveContent(USER_ID, first.noteId(),
                new NoteContentSaveRequest(1, "hello updated", Instant.now()));
        assertThat(saved.status()).isEqualTo("SAVED");
        assertThat(saved.version()).isEqualTo(2);

        assertThatThrownBy(() -> workspaceService.saveContent(USER_ID, first.noteId(),
                new NoteContentSaveRequest(1, "stale write", Instant.now())))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getCode()).isEqualTo("NOTE_VERSION_CONFLICT");
                    assertThat(exception.getDetails()).containsEntry("serverVersion", 2);
                });

        NoteMetadataData metadata = workspaceService.patchMetadata(USER_ID, first.noteId(),
                new NoteMetadataPatchRequest(null, "Renamed note", folder.folderId(), List.of("java", "workspace"), false,
                        new NoteTypography(110, "Pretendard", Map.of("body", 17, "h1", 32)), null));
        assertThat(metadata.documentGroupId()).isEqualTo(defaultDocumentGroupId);
        assertThat(metadata.title()).isEqualTo("Renamed note");
        assertThat(metadata.tags()).containsExactly("java", "workspace");
        assertThat(metadata.typography().scalePercent()).isEqualTo(110);

        NoteListData list = workspaceService.listNotes(USER_ID, folder.folderId(), "workspace", "renamed", false);
        assertThat(list.totalCount()).isEqualTo(1);
        assertThat(list.notes().getFirst()).containsEntry("noteId", first.noteId());

        NoteTagsData tags = workspaceService.putTags(USER_ID, first.noteId(), new NoteTagsPutRequest(List.of("backend", "ssot")));
        assertThat(tags.tags()).containsExactly("backend", "ssot");

        NoteLinkData link = workspaceService.createLink(USER_ID, first.noteId(),
                new NoteLinkCreateRequest(second.noteId(), "Second note", false, "Second alias", "overview"));
        assertThat(link.sourceNoteId()).isEqualTo(first.noteId());
        assertThat(link.targetNoteId()).isEqualTo(second.noteId());
        assertThat(link.linkType()).isEqualTo("MANUAL");
        assertThat(link.anchorText()).isEqualTo("Second alias");
        assertThat(link.headingAnchor()).isEqualTo("overview");

        // Neo4j Verification Query
        if (neo4jDriver != null) {
            try (var session = neo4jDriver.session()) {
                var result = session.run("MATCH (n:Note)-[r:LINKED]->(m:Note) RETURN n.noteId, r.linkId, m.noteId");
                System.out.println("====== NEO4J LINKED RELATIONSHIP VERIFICATION ======");
                boolean found = false;
                while (result.hasNext()) {
                    found = true;
                    var record = result.next();
                    System.out.println("Relationship found: " + record.get("n.noteId").asString() + " -[:LINKED {" + record.get("r.linkId").asString() + "}]-> " + record.get("m.noteId").asString());
                }
                System.out.println("====================================================");
                assertThat(found).isTrue();
            }
        }

        BacklinksData backlinks = workspaceService.backlinks(USER_ID, second.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(first.noteId());
        assertThat(backlinks.backlinks().getFirst().linkedText()).isEqualTo("Second alias");

        GraphData graph = workspaceService.graph(USER_ID, folder.folderId(), null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(graph.nodes()).hasSize(2);
        assertThat(graph.edges()).hasSize(1);
        assertThat(graph.edges().getFirst()).containsEntry("type", "MANUAL");

        FavoriteData favorite = workspaceService.putFavorite(USER_ID, "NOTE", first.noteId(), new FavoritePutRequest(true));
        assertThat(favorite.enabled()).isTrue();

        DeleteNoteData deleted = workspaceService.deleteNote(USER_ID, first.noteId(), "trash");
        assertThat(deleted.noteId()).isEqualTo(first.noteId());
        assertThat(deleted.purgeAt()).isNotNull();

        WorkspaceSyncData activeSync = workspaceService.syncWorkspace(USER_ID, null, false);
        assertThat(activeSync.notes()).extracting(note -> note.get("noteId")).doesNotContain(first.noteId());

        WorkspaceSyncData fullSync = workspaceService.syncWorkspace(USER_ID, null, true);
        assertThat(fullSync.notes()).extracting(note -> note.get("noteId")).contains(first.noteId(), second.noteId());
        assertThat(fullSync.notes()).extracting(note -> note.get("documentGroupId")).containsOnly(defaultDocumentGroupId);
        assertThat(fullSync.folders()).extracting(folderMap -> folderMap.get("documentGroupId")).containsOnly(defaultDocumentGroupId);
        assertThat(eventOutboxRepository.count()).isGreaterThanOrEqualTo(8);
    }

    @Test
    void internalBulkSnapshotAndPatchCommandsUseWorkspaceLedger() {
        InternalNoteBulkCreateData bulk = workspaceService.bulkCreate(new InternalNoteBulkCreateRequest(
                USER_ID,
                "NOTION_IMPORT",
                null,
                null,
                List.of(new InternalNoteCreateItem("notion-1", "Imported note", "imported", List.of("import"), List.of()))
        ));
        assertThat(bulk.createdNotes()).hasSize(1);
        assertThat(bulk.failedItems()).isEmpty();

        String noteId = bulk.createdNotes().getFirst().noteId();
        InternalNoteSnapshotData snapshot = workspaceService.snapshot(noteId);
        assertThat(snapshot.title()).isEqualTo("Imported note");
        assertThat(snapshot.documentGroupId()).isEqualTo("dgrp_default_" + USER_ID);
        assertThat(snapshot.version()).isEqualTo(1);

        NoteContentSaveData patched = workspaceService.patchContentInternal(noteId,
                new InternalNoteContentPatchRequest("AI-Service", 1, "APPEND", Map.of("text", "\nappended"), "cause-1"));
        assertThat(patched.version()).isEqualTo(2);

        InternalNoteSnapshotData afterPatch = workspaceService.snapshot(noteId);
        assertThat(afterPatch.documentGroupId()).isEqualTo("dgrp_default_" + USER_ID);
        assertThat(afterPatch.markdown()).contains("appended");
    }

    @Test
    void internalBulkCreatePreservesRequestedDocumentGroupId() {
        WorkspaceDetailData workspace = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Agent Workspace"));

        InternalNoteBulkCreateData bulk = workspaceService.bulkCreate(new InternalNoteBulkCreateRequest(
                USER_ID,
                "INTELLIGENCE_AGENT",
                workspace.documentGroupId(),
                null,
                List.of(new InternalNoteCreateItem("agent-action-1", "Agent note", "agent body", List.of("agent"), List.of()))
        ));

        assertThat(bulk.createdNotes()).hasSize(1);
        InternalNoteSnapshotData snapshot = workspaceService.snapshot(bulk.createdNotes().getFirst().noteId());
        assertThat(snapshot.documentGroupId()).isEqualTo(workspace.documentGroupId());
    }

    @Test
    void snapshotWithTagsSerializesAsJsonArrayWithoutLazyInitializationException() throws Exception {
        NoteCreatedData created = workspaceService.createNote(
                USER_ID,
                new NoteCreateRequest(null, "Tagged snapshot note", "snapshot body", null, List.of("tag-1", "tag-2"))
        );

        InternalNoteSnapshotData snapshot = workspaceService.snapshot(created.noteId());

        assertThat(snapshot.documentGroupId()).isEqualTo("dgrp_default_" + USER_ID);
        assertThat(snapshot.tags()).containsExactly("tag-1", "tag-2");

        String json = objectMapper.writeValueAsString(ApiResponse.success(snapshot));
        JsonNode root = objectMapper.readTree(json);

        assertThat(root.path("data").path("tags").isArray()).isTrue();
        assertThat(root.path("data").path("tags")).hasSize(2);
        assertThat(root.path("data").path("tags").get(0).asText()).isEqualTo("tag-1");
        assertThat(root.path("data").path("tags").get(1).asText()).isEqualTo("tag-2");
    }

    @Test
    void duplicateFolderAndNoteNamesAreAutoSuffixedWithinTheSameParent() {
        FolderData first = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "폴더", null));
        FolderData second = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "폴더", null));
        FolderData third = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "폴더", null));
        assertThat(first.name()).isEqualTo("폴더");
        assertThat(second.name()).isEqualTo("폴더 2");
        assertThat(third.name()).isEqualTo("폴더 3");

        // depth가 다르면(하위 폴더) 같은 이름을 허용한다.
        FolderData nested = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "폴더", first.folderId()));
        assertThat(nested.name()).isEqualTo("폴더");

        FolderData renamed = workspaceService.patchFolder(USER_ID, third.folderId(), new FolderPatchRequest("폴더", null));
        assertThat(renamed.name()).isEqualTo("폴더 3");

        NoteCreatedData firstNote = workspaceService.createNote(USER_ID, new NoteCreateRequest(null, "노트", "", first.folderId(), List.of()));
        NoteCreatedData secondNote = workspaceService.createNote(USER_ID, new NoteCreateRequest(null, "노트", "", first.folderId(), List.of()));
        assertThat(firstNote.title()).isEqualTo("노트");
        assertThat(secondNote.title()).isEqualTo("노트 2");

        // 다른 폴더에서는 같은 제목을 허용한다.
        NoteCreatedData noteInOtherFolder = workspaceService.createNote(USER_ID, new NoteCreateRequest(null, "노트", "", second.folderId(), List.of()));
        assertThat(noteInOtherFolder.title()).isEqualTo("노트");
    }

    @Test
    void getOrCreateDefaultWorkspaceIsIdempotent() {
        InternalDefaultWorkspaceData first = workspaceService.getOrCreateDefaultWorkspace(USER_ID);
        InternalDefaultWorkspaceData second = workspaceService.getOrCreateDefaultWorkspace(USER_ID);

        assertThat(first.documentGroupId()).isEqualTo("dgrp_default_" + USER_ID);
        assertThat(second.documentGroupId()).isEqualTo(first.documentGroupId());
        assertThat(first.name()).isEqualTo("Default");
        assertThat(Boolean.TRUE.equals(first.isDefault())).isTrue();
        assertThat(workspaceRepository.findDefaultWorkspacesByUserId(USER_ID)).hasSize(1);
    }

    @Test
    void folderTreeKeepsUserWideScopeButIncludesDocumentGroupIdPerFolder() {
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "Tree Folder", null));

        FolderTreeData tree = workspaceService.folderTree(USER_ID);

        assertThat(tree.documentGroupId()).isNull();
        assertThat(tree.folders()).hasSize(1);
        assertThat(tree.folders().getFirst()).containsEntry("folderId", folder.folderId());
        assertThat(tree.folders().getFirst()).containsEntry("documentGroupId", "dgrp_default_" + USER_ID);
    }

    // persistDraft의 documentGroupId 저장 검증은 Neo4j/Spring 컨텍스트가 필요 없는
    // com.brainx.workspace.service.WorkspaceServicePersistDraftTest(Mockito 단위 테스트)로 분리했다.

    @Test
    void syncGraphAllRecreatesNeo4jNodesAndEdgesFromPostgreSqlSSOT() {
        // Given
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "Sync Test Folder", null));
        NoteCreatedData note1 = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Sync Note 1", "sync target", folder.folderId(), List.of("sync")));
        NoteCreatedData note2 = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Sync Note 2", "sync target 2", folder.folderId(), List.of("sync")));
        workspaceService.createLink(USER_ID, note1.noteId(),
                new NoteLinkCreateRequest(note2.noteId(), "Sync Note 2", false, null, null));

        // When
        Map<String, Object> result = workspaceService.syncGraph();

        // Then
        assertThat(result.get("status")).isEqualTo("SUCCESS");
        assertThat((Integer) result.get("notes")).isGreaterThanOrEqualTo(2);
        assertThat((Integer) result.get("relationships")).isGreaterThanOrEqualTo(1);

        if (neo4jDriver != null) {
            try (var session = neo4jDriver.session()) {
                var notesResult = session.run("MATCH (n:Note) RETURN count(n) as cnt");
                long noteCount = notesResult.hasNext() ? notesResult.next().get("cnt").asLong() : 0L;
                assertThat(noteCount).isGreaterThanOrEqualTo(2L);

                var linksResult = session.run("MATCH ()-[r:LINKED]->() RETURN count(r) as cnt");
                long linkCount = linksResult.hasNext() ? linksResult.next().get("cnt").asLong() : 0L;
                assertThat(linkCount).isGreaterThanOrEqualTo(1L);
            }
        }
    }

    @Test
    void savingWikiLinkContentCreatesLedgerLinksAndBackfillKeepsGraphInSync() {
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Target note", "target", null, List.of("graph")));
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Source note", "<p><span data-wiki-link=\"true\" data-title=\"Target note\" data-alias=\"Target alias\" data-heading=\"deep-dive\">[[Target alias]]</span></p>", null, List.of("wiki")));

        GraphData graph = workspaceService.graph(USER_ID, null, null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(graph.edges()).hasSize(1);
        assertThat(graph.edges().getFirst()).containsEntry("type", "WIKI");

        BacklinksData backlinks = workspaceService.backlinks(USER_ID, target.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(source.noteId());
        assertThat(backlinks.backlinks().getFirst().linkedText()).isEqualTo("Target alias");

        Map<String, Object> syncResult = workspaceService.syncGraph();
        assertThat(syncResult).containsEntry("status", "SUCCESS");
        assertThat(syncResult).containsKey("wikiLinksBackfilled");
    }

    @Test
    void creatingTargetNoteAfterSourceSaveReconcilesExistingWikiLinks() {
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Kafka", "<p>message [[envelope]] flow</p>", null, List.of("stream")));

        GraphData beforeTargetExists = workspaceService.graph(USER_ID, null, null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(beforeTargetExists.nodes()).hasSize(1);
        assertThat(beforeTargetExists.edges()).isEmpty();

        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "envelope", "", null, List.of("stream")));

        BacklinksData backlinks = workspaceService.backlinks(USER_ID, target.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(source.noteId());
        assertThat(backlinks.backlinks().getFirst().linkedText()).isEqualTo("envelope");

        GraphData afterTargetExists = workspaceService.graph(USER_ID, null, null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(afterTargetExists.nodes()).hasSize(2);
        assertThat(afterTargetExists.edges()).hasSize(1);
        assertThat(afterTargetExists.edges().getFirst()).containsEntry("type", "WIKI");
    }

    @Test
    void renamingNoteReconcilesExistingWikiLinksForOldAndNewTitles() {
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Kafka", "<p>[[envelope]] payload</p>", null, List.of("stream")));
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "envelope", "", null, List.of("stream")));

        GraphData initialGraph = workspaceService.graph(USER_ID, null, null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(initialGraph.edges()).hasSize(1);

        workspaceService.patchMetadata(USER_ID, target.noteId(),
                new NoteMetadataPatchRequest(null, "Envelope V2", null, List.of("stream"), false, null, null));

        GraphData afterRename = workspaceService.graph(USER_ID, null, null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(afterRename.nodes()).hasSize(2);
        assertThat(afterRename.edges()).isEmpty();
    }
}
