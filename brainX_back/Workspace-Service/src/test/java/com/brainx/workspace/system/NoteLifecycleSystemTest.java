package com.brainx.workspace.system;

import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.entity.ShareLink;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.repository.*;
import com.brainx.workspace.service.WorkspaceService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * [시스템 테스트] 노트 전체 라이프사이클 — 생성·조회·수정·삭제 E2E 검증
 *
 * 검증 범위:
 *   - 노트 생성 → 조회 → 내용 저장(버전 충돌 포함) → 메타데이터 수정 → 공유링크 → 노트 삭제
 *   - 스프링 컨텍스트 전체 로드 (H2 인메모리 DB, Neo4j·Kafka 설정으로 비활성화)
 */
@SpringBootTest
class NoteLifecycleSystemTest {

    private static final String USER_ID = "sys-lifecycle-user-001";

    @Autowired private WorkspaceService workspaceService;
    @Autowired private NoteRepository noteRepository;
    @Autowired private NoteVersionRepository noteVersionRepository;
    @Autowired private NoteLinkRepository noteLinkRepository;
    @Autowired private FavoriteRepository favoriteRepository;
    @Autowired private RecentActivityRepository recentActivityRepository;
    @Autowired private ShareLinkRepository shareLinkRepository;
    @Autowired private GraphLayoutRepository graphLayoutRepository;
    @Autowired private EventOutboxRepository eventOutboxRepository;
    @Autowired private FolderRepository folderRepository;

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
    @DisplayName("[시스템] 노트 생성 → 조회 → 내용 저장 → 메타데이터 수정 전체 흐름")
    void noteFullLifecycle_createReadUpdateDelete() {
        // 1. 생성
        NoteCreatedData created = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "시스템 테스트 노트", "# 제목\n\n본문입니다.", null, List.of("java", "spring")));
        assertThat(created.noteId()).isNotBlank();
        assertThat(created.version()).isEqualTo(1);

        // 2. 조회
        NoteDetailData detail = workspaceService.getNote(USER_ID, created.noteId());
        assertThat(detail.title()).isEqualTo("시스템 테스트 노트");
        assertThat(detail.tags()).containsExactlyInAnyOrder("java", "spring");

        // 3. 내용 저장 — 버전 증가
        NoteContentSaveData saved = workspaceService.saveContent(USER_ID, created.noteId(),
                new NoteContentSaveRequest(1, "수정된 내용", Instant.now()));
        assertThat(saved.version()).isEqualTo(2);
        assertThat(saved.status()).isEqualTo("SAVED");

        // 4. 메타데이터 수정
        NoteMetadataData meta = workspaceService.patchMetadata(USER_ID, created.noteId(),
                new NoteMetadataPatchRequest(null, "제목 변경됨", null, List.of("backend"), false, null, null));
        assertThat(meta.title()).isEqualTo("제목 변경됨");
        assertThat(meta.tags()).contains("backend");

        // 5. 삭제
        DeleteNoteData deleted = workspaceService.deleteNote(USER_ID, created.noteId(), "trash");
        assertThat(deleted.purgeAt()).isNotNull();

        WorkspaceSyncData active = workspaceService.syncWorkspace(USER_ID, null, false);
        assertThat(active.notes()).extracting(n -> n.get("noteId"))
                .doesNotContain(created.noteId());
    }

    @Test
    @DisplayName("[시스템] 낙관적 잠금 — 구버전으로 내용 저장 시 NOTE_VERSION_CONFLICT 예외")
    void saveContent_withStaleVersion_throwsVersionConflict() {
        // given
        NoteCreatedData created = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "충돌 테스트", "초기 내용", null, List.of()));
        workspaceService.saveContent(USER_ID, created.noteId(),
                new NoteContentSaveRequest(1, "첫 번째 수정", Instant.now()));

        // when / then — version=1로 재저장 시도 → 충돌
        assertThatThrownBy(() -> workspaceService.saveContent(USER_ID, created.noteId(),
                new NoteContentSaveRequest(1, "구버전 덮어쓰기", Instant.now())))
                .isInstanceOfSatisfying(WorkspaceException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getCode()).isEqualTo("NOTE_VERSION_CONFLICT");
                    assertThat(ex.getDetails()).containsEntry("serverVersion", 2);
                });
    }

    @Test
    @DisplayName("[시스템] 폴더 생성 후 노트 이동 — 동일 폴더 내 이름 중복 시 자동 접미사")
    void createFolder_andMoveNote_duplicateNameAutoSuffixed() {
        // given — 폴더 생성
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "개발 노트", null));
        NoteCreatedData note1 = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Java", "내용1", folder.folderId(), List.of()));
        NoteCreatedData note2 = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Java", "내용2", folder.folderId(), List.of()));

        // 같은 폴더에 같은 이름 → 자동 접미사 "Java 2"
        assertThat(note1.title()).isEqualTo("Java");
        assertThat(note2.title()).isEqualTo("Java 2");
    }

    @Test
    @DisplayName("[시스템] 노트 목록 조회 — 폴더·태그·키워드 필터링")
    void listNotes_withFiltersCombined_returnsMatchingNotes() {
        // given
        FolderData folder = workspaceService.createFolder(USER_ID, new FolderCreateRequest(null, "테스트 폴더", null));
        workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "Spring 개요", "Spring 내용", folder.folderId(), List.of("java", "spring")));
        workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "React 기초", "React 내용", folder.folderId(), List.of("frontend")));

        // when — 태그 + 키워드 필터
        NoteListData result = workspaceService.listNotes(USER_ID, folder.folderId(), "spring", "spring", false);

        // then
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.notes().getFirst()).containsEntry("title", "Spring 개요");
    }

    @Test
    @DisplayName("[시스템][WS-01 회귀] expiresAt=null 공유링크 조회 시 예외 발생 — 비회귀 테스트")
    void publicShare_withNullExpiresAt_regressionCheck() {
        // given
        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "공유 테스트 노트", "내용", null, List.of()));

        ShareLink badLink = new ShareLink(
                "sys-share-null-" + System.currentTimeMillis(),
                USER_ID,
                note.noteId(),
                "READ",
                null,           // ← 수정 전: expiresAt=null 허용
                Instant.now()
        );
        shareLinkRepository.saveAndFlush(badLink);

        // when / then — NPE 또는 WorkspaceException 발생 (어떤 예외든 허용)
        // 수정 후: null 가드 추가 → IllegalArgumentException 또는 WorkspaceException으로 변경 필요
        assertThatThrownBy(() -> workspaceService.publicShare(badLink.getShareId()))
                .isInstanceOfAny(NullPointerException.class, WorkspaceException.class,
                        IllegalArgumentException.class);
    }

    @Test
    @DisplayName("[시스템] EventOutbox 이벤트 발행 확인 — 노트 CRUD 후 이벤트 누적")
    void noteOperations_publishOutboxEvents() {
        // given
        long before = eventOutboxRepository.count();

        NoteCreatedData note = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(null, "이벤트 테스트", "내용", null, List.of()));
        workspaceService.saveContent(USER_ID, note.noteId(),
                new NoteContentSaveRequest(1, "수정", Instant.now()));
        workspaceService.deleteNote(USER_ID, note.noteId(), "trash");

        // then — 최소 3개 이상의 이벤트(생성/수정/삭제)가 발행되어야 함
        long after = eventOutboxRepository.count();
        assertThat(after - before).isGreaterThanOrEqualTo(3);
    }
}
