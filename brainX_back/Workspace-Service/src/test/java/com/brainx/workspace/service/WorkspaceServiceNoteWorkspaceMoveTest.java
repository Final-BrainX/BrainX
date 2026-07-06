package com.brainx.workspace.service;

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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceNoteWorkspaceMoveTest {

    private static final String USER_ID = "usr_move_test";
    private static final String SOURCE_DOCUMENT_GROUP_ID = "dgrp_source";
    private static final String TARGET_DOCUMENT_GROUP_ID = "dgrp_target";

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

    private Note note(String noteId, String title, String documentGroupId, String folderId) {
        return new Note(noteId, USER_ID, documentGroupId, title, "content", folderId, List.of("tag-a"), Instant.now());
    }

    private void stubWorkspace(String documentGroupId) {
        given(workspaceRepository.findByDocumentGroupIdAndUserId(documentGroupId, USER_ID))
                .willReturn(Optional.of(new Workspace(documentGroupId, USER_ID, "Workspace", false, Instant.now())));
    }

    @Test
    void movingNoteToAnotherWorkspaceResetsFolderToRootAndPublishesNotesMoved() {
        Note note = note("note_1", "Alpha", SOURCE_DOCUMENT_GROUP_ID, "fld_source");
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));
        stubWorkspace(TARGET_DOCUMENT_GROUP_ID);
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, TARGET_DOCUMENT_GROUP_ID, null))
                .willReturn(List.of());

        NoteMetadataData result = workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(TARGET_DOCUMENT_GROUP_ID, null, "fld_ignored", null, null, null, null));

        assertThat(result.documentGroupId()).isEqualTo(TARGET_DOCUMENT_GROUP_ID);
        assertThat(result.folderId()).isNull();
        assertThat(result.version()).isEqualTo(2);

        ArgumentCaptor<Map<String, Object>> movedPayload = ArgumentCaptor.forClass(Map.class);
        verify(eventPublisher).publish(eq("NotesMoved"), eq(USER_ID), movedPayload.capture());
        assertThat(movedPayload.getValue()).containsEntry("userId", USER_ID);
        assertThat(movedPayload.getValue()).containsEntry("documentGroupId", TARGET_DOCUMENT_GROUP_ID);
        assertThat(movedPayload.getValue()).containsEntry("sourceFolderId", "fld_source");
        assertThat(movedPayload.getValue()).containsEntry("targetFolderId", null);
        assertThat((List<String>) movedPayload.getValue().get("noteIds")).containsExactly("note_1");

        ArgumentCaptor<Map<String, Object>> metadataPayload = ArgumentCaptor.forClass(Map.class);
        verify(eventPublisher).publish(eq("NoteMetadataChanged"), eq(USER_ID), metadataPayload.capture());
        assertThat(metadataPayload.getValue()).containsEntry("folderId", null);
    }

    @Test
    void movingNoteToAnotherWorkspaceSuffixesDuplicateTitleAtTargetRoot() {
        Note note = note("note_1", "Alpha", SOURCE_DOCUMENT_GROUP_ID, "fld_source");
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));
        stubWorkspace(TARGET_DOCUMENT_GROUP_ID);
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, TARGET_DOCUMENT_GROUP_ID, null))
                .willReturn(List.of(note("note_existing", "Alpha", TARGET_DOCUMENT_GROUP_ID, null)));

        NoteMetadataData result = workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(TARGET_DOCUMENT_GROUP_ID, null, null, null, null, null, null));

        assertThat(result.title()).isEqualTo("Alpha 2");
        assertThat(result.documentGroupId()).isEqualTo(TARGET_DOCUMENT_GROUP_ID);
        assertThat(result.folderId()).isNull();
    }

    @Test
    void movingNoteToWorkspaceNotOwnedByUserReturnsNotFound() {
        Note note = note("note_1", "Alpha", SOURCE_DOCUMENT_GROUP_ID, "fld_source");
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));
        given(workspaceRepository.findByDocumentGroupIdAndUserId(TARGET_DOCUMENT_GROUP_ID, USER_ID))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(TARGET_DOCUMENT_GROUP_ID, null, null, null, null, null, null)))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(exception.getCode()).isEqualTo("WORKSPACE_NOT_FOUND");
                });
    }

    @Test
    void sameWorkspaceMoveRequestIsNoOp() {
        Note note = note("note_1", "Alpha", SOURCE_DOCUMENT_GROUP_ID, "fld_source");
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));

        NoteMetadataData result = workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(SOURCE_DOCUMENT_GROUP_ID, null, null, null, null, null, null));

        assertThat(result.documentGroupId()).isEqualTo(SOURCE_DOCUMENT_GROUP_ID);
        assertThat(result.folderId()).isEqualTo("fld_source");
        assertThat(result.version()).isEqualTo(1);
        verifyNoInteractions(workspaceRepository, noteVersionRepository, recentActivityRepository, eventPublisher);
    }

    @Test
    void patchingFolderWithoutDocumentGroupIdKeepsExistingBehavior() {
        Note note = note("note_1", "Alpha", SOURCE_DOCUMENT_GROUP_ID, "fld_source");
        Folder targetFolder = new Folder("fld_target", USER_ID, SOURCE_DOCUMENT_GROUP_ID, "Target", null, Instant.now());
        given(noteRepository.findByNoteIdAndUserId("note_1", USER_ID)).willReturn(Optional.of(note));
        given(folderRepository.findByFolderIdAndUserId("fld_target", USER_ID)).willReturn(Optional.of(targetFolder));
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, SOURCE_DOCUMENT_GROUP_ID, "fld_target"))
                .willReturn(List.of());

        NoteMetadataData result = workspaceService.patchMetadata(USER_ID, "note_1",
                new NoteMetadataPatchRequest(null, null, "fld_target", null, null, null, null));

        assertThat(result.documentGroupId()).isEqualTo(SOURCE_DOCUMENT_GROUP_ID);
        assertThat(result.folderId()).isEqualTo("fld_target");
        verify(eventPublisher, never()).publish(eq("NotesMoved"), eq(USER_ID), any());
        verify(eventPublisher).publish(eq("NoteMetadataChanged"), eq(USER_ID), any());
    }
}
