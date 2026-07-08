package com.brainx.workspace;

import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.entity.Note;
import com.brainx.workspace.repository.*;
import com.brainx.workspace.service.WorkspaceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** syncWikiLinksForNote()의 target 조회가 source note와 같은 documentGroupId(Workspace) 안에서만
    이뤄지는지 검증한다 — createLink(createIfMissing)와 동일한 Workspace 정책이어야 한다. */
@SpringBootTest
class WorkspaceServiceWikiLinkWorkspaceScopeTest {
    private static final String USER_ID = "usr_wiki_scope_test";

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
    @Autowired
    WorkspaceRepository workspaceRepository;

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
        workspaceRepository.deleteAll();
    }

    @Test
    void wikiLinkOnlyConnectsToSameWorkspaceNoteWithSameTitle() {
        // Given: Workspace A와 Workspace B에 같은 제목("회의") 노트가 하나씩 있다.
        WorkspaceDetailData workspaceA = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace A"));
        WorkspaceDetailData workspaceB = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace B"));

        NoteCreatedData meetingInA = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspaceA.documentGroupId(), "회의", "", null, List.of()));
        NoteCreatedData meetingInB = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspaceB.documentGroupId(), "회의", "", null, List.of()));

        // When: Workspace A의 다른 노트가 [[회의]]를 참조한다.
        NoteCreatedData sourceInA = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspaceA.documentGroupId(), "주간 정리", "<p>[[회의]] 내용 정리</p>", null, List.of()));

        // Then: Workspace A의 "회의"에만 backlink가 생기고, Workspace B의 "회의"는 연결되지 않는다.
        BacklinksData backlinksA = workspaceService.backlinks(USER_ID, meetingInA.noteId());
        assertThat(backlinksA.backlinks()).hasSize(1);
        assertThat(backlinksA.backlinks().getFirst().sourceNoteId()).isEqualTo(sourceInA.noteId());

        BacklinksData backlinksB = workspaceService.backlinks(USER_ID, meetingInB.noteId());
        assertThat(backlinksB.backlinks()).isEmpty();
    }

    @Test
    void wikiLinkStillConnectsLegacyNullDocumentGroupNotesToEachOther() {
        // Given: documentGroupId가 없는(레거시) 노트 두 개. createNote()는 non-guest 유저에게
        // 항상 default Workspace를 resolve해버리므로(Ticket6), 진짜 레거시 null 데이터를
        // 재현하려면 Note 엔티티를 리포지토리로 직접 저장해야 한다.
        Instant now = Instant.now();
        Note legacyTarget = new Note("note_legacy_target", USER_ID, null, "레거시 노트", "", null, List.of(), now);
        noteRepository.save(legacyTarget);
        Note legacySource = new Note("note_legacy_source", USER_ID, null, "출처", "", null, List.of(), now);
        noteRepository.save(legacySource);

        // When: 같은 documentGroupId=null인 다른 노트가 그것을 본문에서 참조한다(saveContent가
        // syncWikiLinksForNote를 태운다).
        workspaceService.saveContent(USER_ID, legacySource.getNoteId(),
                new NoteContentSaveRequest(1, "<p>[[레거시 노트]] 참고</p>", now));

        // Then: null끼리는 기존처럼 정상 연결된다(legacy 정책 유지).
        BacklinksData backlinks = workspaceService.backlinks(USER_ID, legacyTarget.getNoteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(legacySource.getNoteId());
    }

    @Test
    void wikiLinkConnectsToNoteWhoseTitleHasLeadingEmoji() {
        // Given: Notion 가져오기 등으로 제목 앞에 이모지 아이콘이 붙은 노트가 있다.
        WorkspaceDetailData workspace = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace"));
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "📄 프로젝트 기획", "", null, List.of()));

        // When: 다른 노트가 이모지 없이 그 제목을 [[프로젝트 기획]]으로 참조한다.
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "주간 정리", "<p>[[프로젝트 기획]] 진행 상황</p>", null, List.of()));

        // Then: exact-match였다면 실패했을 매칭이 정규화 덕분에 성공해 backlink가 생긴다.
        BacklinksData backlinks = workspaceService.backlinks(USER_ID, target.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(source.noteId());
    }

    @Test
    void wikiLinkConnectsDespiteDoubleEscapedAmpersandInLinkTitle() {
        // Given: 제목에 &가 들어간 노트가 있다.
        WorkspaceDetailData workspace = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace"));
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 & 평가 플랫폼", "", null, List.of()));

        // When: 링크에 박제된 data-title이 저장 경로에서 실수로 두 번 이스케이프된 채로
        // (& -> &amp; -> &amp;amp;) 저장돼 있다 — 실제로 관찰된 데이터 손상 패턴이다.
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "포트폴리오",
                        "<p><span data-wiki-link=\"true\" data-title=\"🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 &amp;amp; 평가 플랫폼\">"
                                + "[[🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 &amp;amp; 평가 플랫폼]]</span></p>", null, List.of()));

        // Then: 디코딩 덕분에 실제 제목과 매칭돼 backlink가 생긴다.
        BacklinksData backlinks = workspaceService.backlinks(USER_ID, target.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(source.noteId());
    }

    @Test
    void importingEmojiTitledNoteRetroactivelyConnectsExistingDanglingReference() {
        // Given: 다른 노트가 먼저 존재하고, 아직 만들어지지 않은(예: 아직 Notion에서 가져오기
        // 전인) 노트를 이모지 없이 [[...]]로 미리 참조하고 있다 — 이모지는 장식으로 여기고
        // 안 타이핑하는 흔한 패턴.
        WorkspaceDetailData workspace = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace"));
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "주간 정리",
                        "<p>[[푸디스트 (Foodiest) — 음식점 리뷰 & 평가 플랫폼]] 참고</p>", null, List.of()));

        // When: 그 제목의 노트를 나중에 가져온다(Notion import 등) — 제목 앞에 이모지가 붙는다.
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 & 평가 플랫폼", "", null, List.of()));

        // Then: noteMayReferenceTitle의 사전 필터가 이모지 때문에 걸러버리지 않고, 먼저 있던
        // 노트의 dangling 참조가 새로 만들어진 노트로 소급 연결된다.
        BacklinksData backlinks = workspaceService.backlinks(USER_ID, target.noteId());
        assertThat(backlinks.backlinks()).hasSize(1);
        assertThat(backlinks.backlinks().getFirst().sourceNoteId()).isEqualTo(source.noteId());
    }

    @Test
    void createLinkByTitleResolvesExistingEmojiTitledNoteInsteadOfCreatingDuplicate() {
        // Given: 이모지 아이콘이 붙은 노트가 이미 있다.
        WorkspaceDetailData workspace = workspaceService.createWorkspace(USER_ID, new WorkspaceCreateRequest("Workspace"));
        NoteCreatedData target = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "📄 프로젝트 기획", "", null, List.of()));
        NoteCreatedData source = workspaceService.createNote(USER_ID,
                new NoteCreateRequest(workspace.documentGroupId(), "주간 정리", "", null, List.of()));
        long noteCountBefore = noteRepository.count();

        // When: createIfMissing=true로 이모지 없는 제목으로 링크를 만든다 — exact-match였다면
        // 기존 노트를 못 찾고 제목이 "프로젝트 기획"인 중복 노트를 새로 만들었을 상황이다.
        NoteLinkData link = workspaceService.createLink(USER_ID, source.noteId(),
                new NoteLinkCreateRequest(null, "프로젝트 기획", true, null, null));

        // Then: 새 노트를 만들지 않고 기존 노트에 연결된다.
        assertThat(link.targetNoteId()).isEqualTo(target.noteId());
        assertThat(noteRepository.count()).isEqualTo(noteCountBefore);
    }
}
