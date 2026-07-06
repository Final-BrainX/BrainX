package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.InternalDefaultWorkspaceData;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceDefaultWorkspaceTest {

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
    void getOrCreateDefaultWorkspaceReturnsExistingWorkspaceWithoutCreatingAnother() {
        Instant now = Instant.parse("2026-07-05T00:00:00Z");
        Workspace existing = new Workspace("dgrp_default_usr_ticket4", "usr_ticket4", "Default", true, now);
        given(workspaceRepository.findDefaultWorkspacesByUserId("usr_ticket4")).willReturn(List.of(existing));

        InternalDefaultWorkspaceData first = workspaceService.getOrCreateDefaultWorkspace("usr_ticket4");
        InternalDefaultWorkspaceData second = workspaceService.getOrCreateDefaultWorkspace("usr_ticket4");

        assertThat(first.documentGroupId()).isEqualTo("dgrp_default_usr_ticket4");
        assertThat(second.documentGroupId()).isEqualTo(first.documentGroupId());
        assertThat(first.userId()).isEqualTo("usr_ticket4");
        assertThat(Boolean.TRUE.equals(first.isDefault())).isTrue();
        verify(workspaceRepository, times(2)).findDefaultWorkspacesByUserId("usr_ticket4");
    }

    @Test
    void getOrCreateDefaultWorkspaceCreatesDeterministicDefaultWorkspaceWhenMissing() {
        given(workspaceRepository.findDefaultWorkspacesByUserId("usr_new")).willReturn(List.of());
        given(workspaceRepository.findById("dgrp_default_usr_new")).willReturn(Optional.empty());
        given(workspaceRepository.save(any(Workspace.class))).willAnswer(invocation -> invocation.getArgument(0));

        InternalDefaultWorkspaceData created = workspaceService.getOrCreateDefaultWorkspace("usr_new");

        assertThat(created.documentGroupId()).isEqualTo("dgrp_default_usr_new");
        assertThat(created.userId()).isEqualTo("usr_new");
        assertThat(created.name()).isEqualTo("Default");
        assertThat(Boolean.TRUE.equals(created.isDefault())).isTrue();
        verify(workspaceRepository).findById("dgrp_default_usr_new");
        verify(workspaceRepository).save(any(Workspace.class));
    }
}
