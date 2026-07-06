package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.FolderCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.FolderData;
import com.brainx.workspace.dto.WorkspaceDtos.FolderPatchRequest;
import com.brainx.workspace.dto.WorkspaceDtos.NoteCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.NoteCreatedData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
import com.brainx.workspace.dto.WorkspaceDtos.ClaimedNoteDraft;
import com.brainx.workspace.entity.Folder;
import com.brainx.workspace.entity.Note;
import com.brainx.workspace.entity.Workspace;
import com.brainx.workspace.event.WorkspaceEventPublisher;
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

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Ticket 8(Duplicate Rule)의 Workspace 단위 중복 검사 확장을 검증하는 경량 단위
 * 테스트다. Mockito로 모든 repository/collaborator를 대체해 Spring 컨텍스트나
 * Neo4j 없이 즉시 실행된다.
 */
@ExtendWith(MockitoExtension.class)
class WorkspaceServiceDuplicateRuleTest {

    private static final String USER_ID = "usr_dup_test";
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

    private void stubWorkspaceOwnership(String documentGroupId) {
        given(workspaceRepository.findByDocumentGroupIdAndUserId(documentGroupId, USER_ID))
                .willReturn(Optional.of(new Workspace(documentGroupId, USER_ID, "Workspace", false, Instant.now())));
    }

    private void stubDefaultWorkspaceCreation() {
        given(workspaceRepository.save(any(Workspace.class))).willAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void differentWorkspaceRootsDoNotSuffixSameNoteTitle() {
        stubWorkspaceOwnership("dgrp_a");
        stubWorkspaceOwnership("dgrp_b");
        Note existingInA = new Note("note_existing", USER_ID, "dgrp_a", "Untitled", "", null, List.of(), Instant.now());
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, "dgrp_a", null))
                .willReturn(List.of(existingInA));

        workspaceService.createNote(USER_ID, new NoteCreateRequest("dgrp_a", "Untitled", "", null, List.of()));
        NoteCreatedData noteInB = workspaceService.createNote(USER_ID,
                new NoteCreateRequest("dgrp_b", "Untitled", "", null, List.of()));

        assertThat(noteInB.title()).isEqualTo("Untitled");
        assertThat(noteInB.documentGroupId()).isEqualTo("dgrp_b");
    }

    @Test
    void sameWorkspaceRootStillSuffixesSameNoteTitle() {
        stubWorkspaceOwnership("dgrp_a");
        Note existingInA = new Note("note_existing", USER_ID, "dgrp_a", "Untitled", "", null, List.of(), Instant.now());
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, "dgrp_a", null))
                .willReturn(List.of(existingInA));

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest("dgrp_a", "Untitled", "", null, List.of()));

        assertThat(note.title()).isEqualTo("Untitled 2");
    }

    @Test
    void differentWorkspaceRootsDoNotSuffixSameFolderName() {
        stubWorkspaceOwnership("dgrp_a");
        stubWorkspaceOwnership("dgrp_b");
        Folder existingInA = new Folder("fld_existing", USER_ID, "dgrp_a", "Docs", null, Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(USER_ID, "dgrp_a", null))
                .willReturn(List.of(existingInA));

        workspaceService.createFolder(USER_ID, new FolderCreateRequest("dgrp_a", "Docs", null));
        FolderData folderInB = workspaceService.createFolder(USER_ID, new FolderCreateRequest("dgrp_b", "Docs", null));

        assertThat(folderInB.name()).isEqualTo("Docs");
        assertThat(folderInB.documentGroupId()).isEqualTo("dgrp_b");
    }

    @Test
    void sameWorkspaceRootStillSuffixesSameFolderName() {
        stubWorkspaceOwnership("dgrp_a");
        Folder existingInA = new Folder("fld_existing", USER_ID, "dgrp_a", "Docs", null, Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(USER_ID, "dgrp_a", null))
                .willReturn(List.of(existingInA));

        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest("dgrp_a", "Docs", null));

        assertThat(folder.name()).isEqualTo("Docs 2");
    }

    @Test
    void sameWorkspaceSameFolderStillSuffixesNoteTitle() {
        stubWorkspaceOwnership("dgrp_a");
        Folder folder = new Folder("fld_1", USER_ID, "dgrp_a", "Folder", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_1", USER_ID)).willReturn(Optional.of(folder));
        Note existingInFolder = new Note("note_existing", USER_ID, "dgrp_a", "Note", "", "fld_1", List.of(), Instant.now());
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, "dgrp_a", "fld_1"))
                .willReturn(List.of(existingInFolder));

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest("dgrp_a", "Note", "", "fld_1", List.of()));

        assertThat(note.title()).isEqualTo("Note 2");
    }

    @Test
    void sameWorkspaceSameParentStillSuffixesFolderName() {
        stubWorkspaceOwnership("dgrp_a");
        Folder parent = new Folder("fld_parent", USER_ID, "dgrp_a", "Parent", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_parent", USER_ID)).willReturn(Optional.of(parent));
        Folder existingChild = new Folder("fld_child", USER_ID, "dgrp_a", "Child", "fld_parent", Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(USER_ID, "dgrp_a", "fld_parent"))
                .willReturn(List.of(existingChild));

        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest("dgrp_a", "Child", "fld_parent"));

        assertThat(folder.name()).isEqualTo("Child 2");
    }

    @Test
    void guestNullDocumentGroupIdStillSuffixesWithinNullGroup() {
        String guestId = "gst_abcdefghijklmnop";
        Folder existingGuestFolder = new Folder("fld_guest_existing", guestId, null, "Notes", null, Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(guestId, null, null))
                .willReturn(List.of(existingGuestFolder));

        FolderData folder = workspaceService.createFolder(guestId, new FolderCreateRequest(null, "Notes", null));

        assertThat(folder.documentGroupId()).isNull();
        assertThat(folder.name()).isEqualTo("Notes 2");
        verifyNoInteractions(workspaceRepository);
    }

    @Test
    void legacyNullDocumentGroupIdFolderDedupeStaysWithinNullGroup() {
        Folder legacyFolder = new Folder("fld_legacy", USER_ID, null, "Old Name", null, Instant.now());
        given(folderRepository.findByFolderIdAndUserId("fld_legacy", USER_ID)).willReturn(Optional.of(legacyFolder));
        Folder otherLegacySibling = new Folder("fld_legacy_sibling", USER_ID, null, "New Name", null, Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(USER_ID, null, null))
                .willReturn(List.of(otherLegacySibling));

        FolderData renamed = workspaceService.patchFolder(USER_ID, "fld_legacy", new FolderPatchRequest("New Name", null));

        assertThat(renamed.name()).isEqualTo("New Name 2");
    }

    @Test
    void persistDraftDedupesWithinResolvedDocumentGroup() {
        stubDefaultWorkspaceCreation();
        Note existingDefault = new Note("note_existing", USER_ID, DEFAULT_DOCUMENT_GROUP_ID, "제목 없음", "", null, List.of(), Instant.now());
        given(noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(USER_ID, DEFAULT_DOCUMENT_GROUP_ID, null))
                .willReturn(List.of(existingDefault));
        NoteDraftData draft = new NoteDraftData("note_draft_1", null, "USER", "", "draft body", null, 1,
                Instant.now(), Instant.now(), Instant.now().plusSeconds(60));

        ClaimedNoteDraft claimed = workspaceService.persistDraft(USER_ID, draft);

        assertThat(claimed.documentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
        assertThat(claimed.title()).isEqualTo("제목 없음 2");
    }
}
