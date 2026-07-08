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
}
