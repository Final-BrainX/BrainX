package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.ClaimedNoteDraft;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftClaimData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftListData;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Ticket 9(Guest Draft Claim)의 claimGuestDrafts 오케스트레이션 — 특히 Redis draft
 * 삭제가 Postgres 트랜잭션 커밋 이후로 미뤄지는지, 롤백 시 삭제되지 않는지, 두 번
 * 호출해도 같은 Note가 중복 생성되지 않는지를 검증하는 경량 단위 테스트다. Spring
 * 컨텍스트 없이 TransactionSynchronizationManager를 직접 구동해 커밋/롤백을
 * 시뮬레이션한다.
 */
@ExtendWith(MockitoExtension.class)
class NoteDraftPersistenceServiceTest {

    private static final String MEMBER_ID = "usr_claim_test";
    private static final String GUEST_ID = "gst_abcdefghijklmnop";
    private static final Actor GUEST_ACTOR = new Actor(ActorType.GUEST, GUEST_ID);

    @Mock private NoteDraftService noteDraftService;
    @Mock private WorkspaceService workspaceService;

    @InjectMocks
    private NoteDraftPersistenceService noteDraftPersistenceService;

    @BeforeEach
    void initTransactionSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void redisDraftDeleteIsDeferredUntilAfterCommit() {
        NoteDraftData draft = draft("note_1");
        given(noteDraftService.listDrafts(GUEST_ACTOR)).willReturn(new NoteDraftListData(List.of(draft)));
        given(workspaceService.persistDraft(eq(MEMBER_ID), eq(draft)))
                .willReturn(claimed("note_1"));

        NoteDraftClaimData result = noteDraftPersistenceService.claimGuestDrafts(MEMBER_ID, GUEST_ID);

        assertThat(result.claimedCount()).isEqualTo(1);
        verify(noteDraftService, never()).deleteDraft(any(), any());

        triggerAfterCommit();

        verify(noteDraftService).deleteDraft(GUEST_ACTOR, "note_1");
    }

    @Test
    void redisDraftIsNotDeletedWhenClaimFailsMidway() {
        NoteDraftData draft1 = draft("note_1");
        NoteDraftData draft2 = draft("note_2");
        given(noteDraftService.listDrafts(GUEST_ACTOR)).willReturn(new NoteDraftListData(List.of(draft1, draft2)));
        given(workspaceService.persistDraft(eq(MEMBER_ID), eq(draft1))).willReturn(claimed("note_1"));
        given(workspaceService.persistDraft(eq(MEMBER_ID), eq(draft2))).willThrow(new RuntimeException("boom"));

        assertThatThrownBy(() -> noteDraftPersistenceService.claimGuestDrafts(MEMBER_ID, GUEST_ID))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("boom");

        verify(noteDraftService, never()).deleteDraft(any(), any());
        assertThat(TransactionSynchronizationManager.getSynchronizations()).isEmpty();
    }

    @Test
    void claimingTwiceDoesNotCreateDuplicateNotes() {
        NoteDraftData draft = draft("note_1");
        given(noteDraftService.listDrafts(GUEST_ACTOR))
                .willReturn(new NoteDraftListData(List.of(draft)))
                .willReturn(new NoteDraftListData(List.of()));
        given(workspaceService.persistDraft(eq(MEMBER_ID), eq(draft))).willReturn(claimed("note_1"));

        NoteDraftClaimData first = noteDraftPersistenceService.claimGuestDrafts(MEMBER_ID, GUEST_ID);
        triggerAfterCommit();
        NoteDraftClaimData second = noteDraftPersistenceService.claimGuestDrafts(MEMBER_ID, GUEST_ID);

        assertThat(first.claimedCount()).isEqualTo(1);
        assertThat(second.claimedCount()).isEqualTo(0);
        verify(workspaceService, times(1)).persistDraft(eq(MEMBER_ID), any());
        verify(noteDraftService, times(1)).deleteDraft(GUEST_ACTOR, "note_1");
    }

    private NoteDraftData draft(String noteId) {
        return new NoteDraftData(noteId, null, "GUEST", "Title", "markdown", null, 1,
                Instant.now(), Instant.now(), Instant.now().plusSeconds(60));
    }

    private ClaimedNoteDraft claimed(String noteId) {
        return new ClaimedNoteDraft(noteId, noteId, "dgrp_default_" + MEMBER_ID, "Title", 1);
    }

    private void triggerAfterCommit() {
        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }
    }
}
