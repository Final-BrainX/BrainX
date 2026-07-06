package com.brainx.workspace.service;

import com.brainx.workspace.entity.Folder;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Ticket 9(Guest Draft Claim)의 Folder 승계(reassignGuestFolders)가 회원 default
 * Workspace로 documentGroupId를 올바르게 채우고, Ticket8의 dedupeFolderName을
 * 그대로 재사용해 이름 충돌을 처리하는지 검증하는 경량 단위 테스트다.
 */
@ExtendWith(MockitoExtension.class)
class WorkspaceServiceReassignGuestFoldersTest {

    private static final String GUEST_ID = "gst_abcdefghijklmnop";
    private static final String MEMBER_ID = "usr_reassign_test";
    private static final String DEFAULT_DOCUMENT_GROUP_ID = "dgrp_default_" + MEMBER_ID;

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
    void reassignGuestFoldersSetsMemberDefaultWorkspaceDocumentGroupId() {
        stubDefaultWorkspaceCreation();
        Folder guestFolder = new Folder("fld_guest_1", GUEST_ID, null, "Notes", null, Instant.now());
        given(folderRepository.findByUserIdOrderByNameAsc(GUEST_ID)).willReturn(List.of(guestFolder));

        int reassigned = workspaceService.reassignGuestFolders(GUEST_ID, MEMBER_ID);

        assertThat(reassigned).isEqualTo(1);
        assertThat(guestFolder.getUserId()).isEqualTo(MEMBER_ID);
        assertThat(guestFolder.getDocumentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
    }

    @Test
    void reassignGuestFoldersAppliesDedupeWhenNameAlreadyExistsInMemberWorkspace() {
        stubDefaultWorkspaceCreation();
        Folder guestFolder = new Folder("fld_guest_1", GUEST_ID, null, "Notes", null, Instant.now());
        given(folderRepository.findByUserIdOrderByNameAsc(GUEST_ID)).willReturn(List.of(guestFolder));
        Folder memberExisting = new Folder("fld_member_1", MEMBER_ID, DEFAULT_DOCUMENT_GROUP_ID, "Notes", null, Instant.now());
        given(folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(MEMBER_ID, DEFAULT_DOCUMENT_GROUP_ID, null))
                .willReturn(List.of(memberExisting));

        workspaceService.reassignGuestFolders(GUEST_ID, MEMBER_ID);

        assertThat(guestFolder.getName()).isEqualTo("Notes 2");
        assertThat(guestFolder.getDocumentGroupId()).isEqualTo(DEFAULT_DOCUMENT_GROUP_ID);
    }

    @Test
    void reassignGuestFoldersNeverCreatesWorkspaceWhenTargetIsGuest() {
        Folder guestFolder = new Folder("fld_guest_1", GUEST_ID, null, "Notes", null, Instant.now());
        given(folderRepository.findByUserIdOrderByNameAsc(GUEST_ID)).willReturn(List.of(guestFolder));

        workspaceService.reassignGuestFolders(GUEST_ID, "gst_zzzzzzzzzzzzzzzz");

        assertThat(guestFolder.getDocumentGroupId()).isNull();
        verifyNoInteractions(workspaceRepository);
    }

    @Test
    void reassignGuestFoldersIsNoOpWhenGuestHasNoFolders() {
        given(folderRepository.findByUserIdOrderByNameAsc(GUEST_ID)).willReturn(List.of());

        int reassigned = workspaceService.reassignGuestFolders(GUEST_ID, MEMBER_ID);

        assertThat(reassigned).isEqualTo(0);
        verifyNoInteractions(workspaceRepository);
    }
}
