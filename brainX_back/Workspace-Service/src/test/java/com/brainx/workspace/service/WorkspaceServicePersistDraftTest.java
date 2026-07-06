package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.ClaimedNoteDraft;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

/**
 * persistDraft(draft flush / guest-drafts claim의 실제 Postgres 반영 지점)의
 * documentGroupId 저장 동작만 검증하는 경량 단위 테스트다. Mockito로 모든
 * repository/collaborator를 대체해 Spring 컨텍스트나 Neo4j 없이 즉시 실행되며,
 * WorkspaceServiceCrudTests(@SpringBootTest)의 graph/Neo4j 의존 테스트와는 분리되어
 * 있다.
 */
@ExtendWith(MockitoExtension.class)
class WorkspaceServicePersistDraftTest {

    private static final String USER_ID = "usr_persist_draft";

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
    void persistDraftStoresExplicitDocumentGroupIdWhenProvided() {
        NoteDraftData draft = new NoteDraftData("note_draft_explicit", "dgrp_custom_target", "USER",
                "Draft title", "draft body", null, 1, Instant.now(), Instant.now(), Instant.now().plusSeconds(60));

        ClaimedNoteDraft claimed = workspaceService.persistDraft(USER_ID, draft);

        assertThat(claimed.documentGroupId()).isEqualTo("dgrp_custom_target");
    }

    @Test
    void persistDraftFallsBackToDefaultWorkspaceWhenDocumentGroupIdMissing() {
        given(workspaceRepository.save(any(Workspace.class))).willAnswer(invocation -> invocation.getArgument(0));
        NoteDraftData draft = new NoteDraftData("note_draft_default", null, "USER",
                "Draft title", "draft body", null, 1, Instant.now(), Instant.now(), Instant.now().plusSeconds(60));

        ClaimedNoteDraft claimed = workspaceService.persistDraft(USER_ID, draft);

        String defaultDocumentGroupId = "dgrp_default_" + USER_ID;
        assertThat(claimed.documentGroupId()).isEqualTo(defaultDocumentGroupId);
        assertThat(claimed.documentGroupId()).isNotNull();
    }
}
