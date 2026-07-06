package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.WorkspaceCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspaceDetailData;
import com.brainx.workspace.dto.WorkspaceDtos.WorkspacePatchRequest;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceManagementTest {

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

    @Test
    void createWorkspaceRejectsDuplicateName() {
        given(workspaceRepository.existsByUserIdAndName("usr_member", "Project A")).willReturn(true);

        assertThatThrownBy(() -> workspaceService.createWorkspace("usr_member", new WorkspaceCreateRequest("Project A")))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getCode()).isEqualTo("WORKSPACE_NAME_DUPLICATE");
                });
    }

    @Test
    void patchWorkspaceAllowsKeepingTheSameName() {
        Workspace workspace = new Workspace("dgrp_same", "usr_member", "Project Same", false, Instant.parse("2026-07-05T00:00:00Z"));
        given(workspaceRepository.findByDocumentGroupIdAndUserId("dgrp_same", "usr_member")).willReturn(Optional.of(workspace));

        WorkspaceDetailData response = workspaceService.patchWorkspace("usr_member", "dgrp_same", new WorkspacePatchRequest("Project Same"));

        assertThat(response.documentGroupId()).isEqualTo("dgrp_same");
        assertThat(response.name()).isEqualTo("Project Same");
        verify(workspaceRepository, never()).existsByUserIdAndNameAndDocumentGroupIdNot(any(), any(), any());
    }

    @Test
    void patchWorkspaceRejectsDuplicateNameOwnedBySameUser() {
        Workspace workspace = new Workspace("dgrp_target", "usr_member", "Project B", false, Instant.parse("2026-07-05T00:00:00Z"));
        given(workspaceRepository.findByDocumentGroupIdAndUserId("dgrp_target", "usr_member")).willReturn(Optional.of(workspace));
        given(workspaceRepository.existsByUserIdAndNameAndDocumentGroupIdNot("usr_member", "Project A", "dgrp_target")).willReturn(true);

        assertThatThrownBy(() -> workspaceService.patchWorkspace("usr_member", "dgrp_target", new WorkspacePatchRequest("Project A")))
                .isInstanceOfSatisfying(WorkspaceException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getCode()).isEqualTo("WORKSPACE_NAME_DUPLICATE");
                });
    }
}
