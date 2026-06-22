package com.brainx.workspace;

import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.repository.*;
import com.brainx.workspace.service.WorkspaceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class WorkspaceServiceCrudTests {
    private static final String USER_ID = "usr_test";

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
    }

    @Test
    void noteFolderLinkGraphAndDeleteCrudFollowWorkspaceContract() {
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest("Study", null));
        NoteCreatedData first = workspaceService.createNote(USER_ID,
                new NoteCreateRequest("First note", "hello", folder.folderId(), List.of("java")));
        NoteCreatedData second = workspaceService.createNote(USER_ID,
                new NoteCreateRequest("Second note", "target", folder.folderId(), List.of("graph")));

        NoteDetailData detail = workspaceService.getNote(USER_ID, first.noteId());
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
                new NoteMetadataPatchRequest("Renamed note", folder.folderId(), List.of("java", "workspace"), false,
                        new NoteTypography(110, "Pretendard", Map.of("body", 17, "h1", 32)), null));
        assertThat(metadata.title()).isEqualTo("Renamed note");
        assertThat(metadata.tags()).containsExactly("java", "workspace");
        assertThat(metadata.typography().scalePercent()).isEqualTo(110);

        NoteListData list = workspaceService.listNotes(USER_ID, folder.folderId(), "workspace", "renamed", false);
        assertThat(list.totalCount()).isEqualTo(1);
        assertThat(list.notes().getFirst()).containsEntry("noteId", first.noteId());

        NoteTagsData tags = workspaceService.putTags(USER_ID, first.noteId(), new NoteTagsPutRequest(List.of("backend", "ssot")));
        assertThat(tags.tags()).containsExactly("backend", "ssot");

        NoteLinkData link = workspaceService.createLink(USER_ID, first.noteId(),
                new NoteLinkCreateRequest(second.noteId(), "Second note", false));
        assertThat(link.sourceNoteId()).isEqualTo(first.noteId());
        assertThat(link.targetNoteId()).isEqualTo(second.noteId());

        BacklinksData backlinks = workspaceService.backlinks(USER_ID, second.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(first.noteId());

        GraphData graph = workspaceService.graph(USER_ID, folder.folderId(), null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(1));
        assertThat(graph.nodes()).hasSize(2);
        assertThat(graph.edges()).hasSize(1);

        FavoriteData favorite = workspaceService.putFavorite(USER_ID, "NOTE", first.noteId(), new FavoritePutRequest(true));
        assertThat(favorite.enabled()).isTrue();

        DeleteNoteData deleted = workspaceService.deleteNote(USER_ID, first.noteId(), "trash");
        assertThat(deleted.noteId()).isEqualTo(first.noteId());
        assertThat(deleted.purgeAt()).isNotNull();

        WorkspaceSyncData activeSync = workspaceService.syncWorkspace(USER_ID, null, false);
        assertThat(activeSync.notes()).extracting(note -> note.get("noteId")).doesNotContain(first.noteId());

        WorkspaceSyncData fullSync = workspaceService.syncWorkspace(USER_ID, null, true);
        assertThat(fullSync.notes()).extracting(note -> note.get("noteId")).contains(first.noteId(), second.noteId());
        assertThat(eventOutboxRepository.count()).isGreaterThanOrEqualTo(8);
    }

    @Test
    void internalBulkSnapshotAndPatchCommandsUseWorkspaceLedger() {
        InternalNoteBulkCreateData bulk = workspaceService.bulkCreate(new InternalNoteBulkCreateRequest(
                USER_ID,
                "NOTION_IMPORT",
                null,
                List.of(new InternalNoteCreateItem("notion-1", "Imported note", "imported", List.of("import"), List.of()))
        ));
        assertThat(bulk.createdNotes()).hasSize(1);
        assertThat(bulk.failedItems()).isEmpty();

        String noteId = bulk.createdNotes().getFirst().noteId();
        InternalNoteSnapshotData snapshot = workspaceService.snapshot(noteId);
        assertThat(snapshot.title()).isEqualTo("Imported note");
        assertThat(snapshot.version()).isEqualTo(1);

        NoteContentSaveData patched = workspaceService.patchContentInternal(noteId,
                new InternalNoteContentPatchRequest("AI-Service", 1, "APPEND", Map.of("text", "\nappended"), "cause-1"));
        assertThat(patched.version()).isEqualTo(2);

        InternalNoteSnapshotData afterPatch = workspaceService.snapshot(noteId);
        assertThat(afterPatch.markdown()).contains("appended");
    }
}
