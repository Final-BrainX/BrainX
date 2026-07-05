package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.FolderCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.FolderData;
import com.brainx.workspace.dto.WorkspaceDtos.FolderPatchRequest;
import com.brainx.workspace.dto.WorkspaceDtos.NoteCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.NoteCreatedData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteMetadataData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteMetadataPatchRequest;
import com.brainx.workspace.entity.Folder;
import com.brainx.workspace.entity.Note;
import com.brainx.workspace.entity.Workspace;
import com.brainx.workspace.event.WorkspaceEventPublisher;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.graph.Neo4jGraphProjection;
import com.brainx.workspace.graph.Neo4jGraphQueryService;
import com.brainx.workspace.repository.FavoriteRepository;
import com.brainx.workspace.repository.FolderRepository;
import com.brainx.workspace.repository.GraphLayoutRepository;
import com.brainx.workspace.repository.NoteLinkRepository;
import com.brainx.workspace.repository.NoteRepository;
import com.brainx.workspace.repository.NoteVersionRepository;
import com.brainx.workspace.repository.RecentActivityRepository;
import com.brainx.workspace.repository.ShareLinkRepository;
import com.brainx.workspace.repository.WorkspaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Ticket 7(Workspace Validation)의 documentGroupId/folderId/parentFolderId 관계 검증과
 * Guest → Workspace 생성 회귀 수정을 검증하는 경량 단위 테스트다. Mockito로 모든
 * repository/collaborator를 대체해 Spring 컨텍스트나 Neo4j 없이 즉시 실행된다.
 */
@ExtendWith(MockitoExtension.class)
class WorkspaceServiceWorkspaceValidationTest {

    private static final String USER_ID = "usr_validation";
    private static final String DEFAULT_DOCUMENT_GROUP_ID = "dgrp_default_" + USER_ID;

    @Mock private NoteRepository noteRepository;
    @Mock private NoteVersionRepository noteVersionRepository;
    @Mock private FolderRepository folderRepository;
    @Mock private WorkspaceRepository workspaceRepository;
    @Mock private NoteLinkRepository noteLinkRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private RecentActivityRepository recentActivityRepository;
    @Mock private GraphLayoutRepository graphLayoutRepository;
    @Mock private ShareLinkRepository shareLinkRepository;
    @Mock private WorkspaceEventPublisher eventPublisher;
    @Mock private Neo4jGraphProjection neo4jGraphProjection;
    @Mock private ObjectMapper objectMapper;
    @Mock private Neo4jGraphQueryService neo4jGraphQueryService;

    @InjectMocks
    private WorkspaceService workspaceService;

    private void stubDefaultWorkspaceCreation() {
        given(workspaceRepository.save(any(Workspace.class))).willAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void guestCreatingFolderDoesNotCreateWorkspace() {
        FolderData folder = workspaceService.createFolder("gst_abcdefghijklmnop",
                new FolderCreateRequest(null, "Guest Folder", null));

        assertThat(folder.documentGroupId()).isNull();
        verifyNoInteractions(workspaceRepository);
    }

    @Test
    void memberCreatingNoteWithoutDocumentGroupIdFallsBackToDefaultWorkspace() {
        stubDefaultWorkspaceCreation();

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Note title", "content", null, List.of()));

        assertThat(note.documentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
    }

    @Test
    void memberCreatingFolderWithoutDocumentGroupIdFallsBackToDefaultWorkspace() {
        stubDefaultWorkspaceCreation();

        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "Folder", null));

        assertThat(folder.documentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
    }

    @Test
    void createNoteRejectsFolderFromDifferentWorkspace() {
        stubDefaultWorkspaceCreation();
        Folder otherWorkspaceFolder = new Folder("fld_other", USER_ID, "dgrp_other", "Other", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_other", USER_ID)).willReturn(Optional.of(otherWorkspaceFolder));

        assertThatThrownBy(() -> workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Note title", "content", "fld_other", List.of())))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getCode()).isEqualTo("FOLDER_WORKSPACE_MISMATCH");
                });
    }

    @Test
    void createFolderRejectsParentFromDifferentWorkspace() {
        stubDefaultWorkspaceCreation();
        Folder otherWorkspaceParent = new Folder("fld_parent_other", USER_ID, "dgrp_other", "Parent", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_parent_other", USER_ID)).willReturn(Optional.of(otherWorkspaceParent));

        assertThatThrownBy(() -> workspaceService.createFolder(USER_ID,
                new FolderCreateRequest(null, "Child", "fld_parent_other")))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getCode()).isEqualTo("PARENT_FOLDER_WORKSPACE_MISMATCH");
                });
    }

    @Test
    void patchMetadataRejectsMovingNoteToFolderFromDifferentWorkspace() {
        Note note = new Note("note_1", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "Title", "content", null, List.of(), Instant.now());
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));
        Folder otherWorkspaceFolder = new Folder("fld_other", USER_ID, "dgrp_other", "Other", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_other", USER_ID)).willReturn(Optional.of(otherWorkspaceFolder));

        assertThatThrownBy(() -> workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(null, "fld_other", null, null, null, null)))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getCode()).isEqualTo("FOLDER_WORKSPACE_MISMATCH");
                });
    }

    @Test
    void patchFolderRejectsMovingToParentFromDifferentWorkspace() {
        Folder folder = new Folder("fld_1", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "Folder", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_1", USER_ID)).willReturn(Optional.of(folder));
        Folder otherWorkspaceParent = new Folder("fld_parent_other", USER_ID, "dgrp_other", "Parent", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_parent_other", USER_ID)).willReturn(Optional.of(otherWorkspaceParent));

        assertThatThrownBy(() -> workspaceService.patchFolder(USER_ID, "fld_1",
                new FolderPatchRequest(null, "fld_parent_other")))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getCode()).isEqualTo("PARENT_FOLDER_WORKSPACE_MISMATCH");
                });
    }

    @Test
    void patchFolderRejectsMovingIntoOwnDescendant() {
        Folder parent = new Folder("fld_parent", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "Parent", null, Instant.now());
        Folder child = new Folder("fld_child", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "Child", "fld_parent", Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_parent", USER_ID)).willReturn(Optional.of(parent));
        given(folderRepository.findByUserIdOrderByNameAsc(USER_ID)).willReturn(List.of(parent, child));

        assertThatThrownBy(() -> workspaceService.patchFolder(USER_ID, "fld_parent",
                new FolderPatchRequest(null, "fld_child")))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getCode()).isEqualTo("FOLDER_CYCLE_NOT_ALLOWED");
                });
    }

    @Test
    void sameWorkspaceCreateAndPatchFlowsSucceed() {
        stubDefaultWorkspaceCreation();
        Folder folderA = new Folder("fld_a", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "A", null, Instant.now());
        Folder folderB = new Folder("fld_b", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "B", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_a", USER_ID)).willReturn(Optional.of(folderA));
        given(folderRepository.findByFolderIdAndUserId("fld_b", USER_ID)).willReturn(Optional.of(folderB));
        given(folderRepository.findByUserIdOrderByNameAsc(USER_ID)).willReturn(List.of(folderA, folderB));

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Note title", "content", "fld_a", List.of()));
        assertThat(note.documentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);

        Note persistedNote = new Note(note.noteId(), USER_ID, DEFAULT_DOCUMENT_GROUP_ID, note.title(), "content", "fld_a", List.of(), Instant.now());
        given(noteRepository.findByNoteIdAndUserId(note.noteId(), USER_ID)).willReturn(Optional.of(persistedNote));

        NoteMetadataData metadata = workspaceService.patchMetadata(USER_ID, note.noteId(),
                new NoteMetadataPatchRequest(null, "fld_b", null, null, null, null));
        assertThat(metadata.folderId()).isEqualTo("fld_b");

        FolderData patchedFolder = workspaceService.patchFolder(USER_ID, "fld_b",
                new FolderPatchRequest(null, "fld_a"));
        assertThat(patchedFolder.parentFolderId()).isEqualTo("fld_a");
    }

    @Test
    void legacyFolderWithNullDocumentGroupIdDoesNotBlockNoteCreation() {
        stubDefaultWorkspaceCreation();
        Folder legacyFolder = new Folder("fld_legacy", USER_ID, null, "Legacy", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_legacy", USER_ID)).willReturn(Optional.of(legacyFolder));

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Note title", "content", "fld_legacy", List.of()));

        assertThat(note.documentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
        assertThat(note.folderId()).isEqualTo("fld_legacy");
    }
}
