package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.ClaimedNoteDraft;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftClaimData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftFlushData;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NoteDraftPersistenceService {
    private final NoteDraftService noteDraftService;
    private final WorkspaceService workspaceService;

    @Value("${brainx.workspace.draft.flush-idle-seconds:10}")
    private long flushIdleSeconds;

    @Transactional
    public NoteDraftClaimData claimGuestDrafts(String userId, String guestId) {
        Actor guest = new Actor(ActorType.GUEST, guestId);
        // 폴더 생성은 guest도 막혀있지 않아 Postgres에 guestId 소유로 남아있을 수 있다 — note
        // draft 승계와 같은 트랜잭션에서 폴더 소유권/documentGroupId도 함께 옮긴다.
        workspaceService.reassignGuestFolders(guestId, userId);
        // 즐겨찾기도 폴더와 마찬가지로 guest 상태에서 바로 Postgres에 저장되므로(Redis draft가
        // 아님) 같은 트랜잭션에서 함께 승계한다.
        workspaceService.reassignGuestFavorites(guestId, userId);
        List<ClaimedNoteDraft> claimed = new ArrayList<>();
        List<String> claimedNoteIds = new ArrayList<>();
        try {
            for (NoteDraftData draft : noteDraftService.listDrafts(guest).drafts()) {
                ClaimedNoteDraft note = workspaceService.persistDraft(userId, draft);
                // Redis draft는 여기서 바로 지우지 않는다 — Postgres 트랜잭션이 이후 롤백되면
                // 이미 지운 draft를 되돌릴 수 없어 데이터가 유실된다. 커밋이 확정된 뒤에만
                // 지우도록 아래에서 트랜잭션 커밋 콜백에 등록한다.
                claimedNoteIds.add(draft.noteId());
                claimed.add(note);
            }
            scheduleGuestDraftCleanupAfterCommit(guest, claimedNoteIds);
            log.info("[draft-claim] status=success userId={} guestId={} claimedCount={}",
                    userId, guestId, claimed.size());
            return new NoteDraftClaimData(claimed.size(), claimed);
        } catch (Exception exception) {
            log.warn("[draft-claim] status=failed userId={} guestId={} claimedCount={} reason={}",
                    userId, guestId, claimed.size(), exception.getClass().getSimpleName(), exception);
            throw exception;
        }
    }

    /** claim된 draft의 Redis 삭제를 트랜잭션 커밋 이후로 미룬다 — 롤백되면 콜백 자체가 호출되지
        않아 Redis draft가 그대로 남고(재시도 가능), 커밋이 확정된 뒤에만 실제로 지운다. 트랜잭션
        동기화가 비활성 상태(예: 트랜잭션 없이 직접 호출되는 테스트)에서는 기존처럼 즉시 지운다.
        Redis 삭제 실패는 claim 응답 자체를 깨뜨리면 안 되므로 여기서 잡아 로그만 남긴다. */
    private void scheduleGuestDraftCleanupAfterCommit(Actor guest, List<String> noteIds) {
        if (noteIds.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteGuestDraftsSafely(guest, noteIds);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteGuestDraftsSafely(guest, noteIds);
            }
        });
    }

    private void deleteGuestDraftsSafely(Actor guest, List<String> noteIds) {
        for (String noteId : noteIds) {
            try {
                noteDraftService.deleteDraft(guest, noteId);
            } catch (Exception exception) {
                log.warn("[draft-claim] Redis draft delete failed after commit. guestId={} noteId={} reason={}",
                        guest.id(), noteId, exception.getClass().getSimpleName(), exception);
            }
        }
    }

    @Transactional
    public NoteDraftFlushData flushIdleUserDrafts() {
        Instant cutoff = Instant.now().minusSeconds(flushIdleSeconds);
        int flushed = 0;
        int skipped = 0;
        for (String userId : noteDraftService.userIdsWithDirtyDrafts()) {
            Actor user = new Actor(ActorType.USER, userId);
            for (NoteDraftData draft : noteDraftService.listDrafts(user).drafts()) {
                if (draft.savedAt().isAfter(cutoff)) {
                    skipped++;
                    continue;
                }
                workspaceService.persistDraft(userId, draft);
                noteDraftService.deleteDraft(user, draft.noteId());
                flushed++;
            }
        }
        if (flushed > 0 || skipped > 0) {
            log.info("[draft-flush] status=completed flushedCount={} skippedCount={} cutoff={}",
                    flushed, skipped, cutoff);
        }
        return new NoteDraftFlushData(flushed, skipped);
    }
}
