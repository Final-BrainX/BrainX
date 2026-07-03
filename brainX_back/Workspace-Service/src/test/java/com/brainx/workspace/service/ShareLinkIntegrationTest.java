package com.brainx.workspace.service;

import com.brainx.workspace.entity.ShareLink;
import com.brainx.workspace.event.WorkspaceEventPublisher;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.graph.Neo4jGraphQueryService;
import com.brainx.workspace.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/**
 * [WS-01] 통합 테스트: 공유링크 expiresAt=null 시 NullPointerException 버그 재현
 *
 * WorkspaceService.java:542
 *   share.getExpiresAt().isBefore(Instant.now())
 *   → getExpiresAt()이 null이면 NPE 발생
 */
@ExtendWith(MockitoExtension.class)
class ShareLinkIntegrationTest {

    @InjectMocks
    private WorkspaceService workspaceService;

    @Mock private NoteRepository noteRepository;
    @Mock private NoteVersionRepository noteVersionRepository;
    @Mock private FolderRepository folderRepository;
    @Mock private NoteLinkRepository noteLinkRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private RecentActivityRepository recentActivityRepository;
    @Mock private GraphLayoutRepository graphLayoutRepository;
    @Mock private ShareLinkRepository shareLinkRepository;
    @Mock private WorkspaceEventPublisher eventPublisher;
    @Mock private ObjectMapper objectMapper;
    @Mock private Neo4jGraphQueryService neo4jGraphQueryService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(workspaceService, "publicBaseUrl", "https://brainx.p-e.kr");
    }

    @Test
    @DisplayName("[WS-01] expiresAt=null 공유링크 조회 시 NullPointerException 발생 — 버그 재현")
    void publicShare_whenExpiresAtIsNull_throwsNullPointerException() {
        // given — expiresAt에 null 전달 (엔티티 @Column(nullable=false)이지만 생성자는 막지 않음)
        ShareLink shareLink = new ShareLink(
                "share-null-expires",
                "user-1",
                "note-1",
                "READ",
                null,         // ← expiresAt = null
                Instant.now()
        );
        given(shareLinkRepository.findById("share-null-expires"))
                .willReturn(Optional.of(shareLink));

        // when / then — WorkspaceService.java:542에서 NPE 발생
        assertThatThrownBy(() -> workspaceService.publicShare("share-null-expires"))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    @DisplayName("[WS-01] expiresAt이 미래로 설정된 공유링크는 정상 조회 가능 — 수정 기준 확인")
    void publicShare_whenExpiresAtIsFuture_succeedsIfNoteExists() {
        // given
        ShareLink shareLink = new ShareLink(
                "share-future",
                "user-1",
                "note-1",
                "READ",
                Instant.now().plusSeconds(3600),  // 1시간 후 만료
                Instant.now()
        );
        given(shareLinkRepository.findById("share-future"))
                .willReturn(Optional.of(shareLink));
        given(noteRepository.findById("note-1"))
                .willReturn(Optional.of(new com.brainx.workspace.entity.Note(
                        "note-1", "user-1", "테스트 노트", "내용", null,
                        java.util.List.of(), Instant.now()
                )));

        // when / then — NPE 없이 정상 응답
        var result = workspaceService.publicShare("share-future");
        assertThat(result.shareId()).isEqualTo("share-future");
        assertThat(result.title()).isEqualTo("테스트 노트");
    }

    @Test
    @DisplayName("[WS-01] 이미 만료된 공유링크는 SHARE_LINK_EXPIRED 예외 반환")
    void publicShare_whenExpiresAtIsPast_throwsWorkspaceException() {
        // given
        ShareLink shareLink = new ShareLink(
                "share-expired",
                "user-1",
                "note-1",
                "READ",
                Instant.now().minusSeconds(3600),  // 1시간 전 만료
                Instant.now().minusSeconds(7200)
        );
        given(shareLinkRepository.findById("share-expired"))
                .willReturn(Optional.of(shareLink));

        // when / then
        assertThatThrownBy(() -> workspaceService.publicShare("share-expired"))
                .isInstanceOf(WorkspaceException.class)
                .hasMessageContaining("Share link is not available");
    }
}
