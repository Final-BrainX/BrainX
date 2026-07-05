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
        // draft 승계와 같은 트랜잭션에서 폴더 소유권도 함께 옮긴다.
        workspaceService.reassignGuestFolders(guestId, userId);
        // 즐겨찾기도 폴더와 마찬가지로 guest 상태에서 바로 Postgres에 저장되므로(Redis draft가
        // 아님) 같은 트랜잭션에서 함께 승계한다.
        workspaceService.reassignGuestFavorites(guestId, userId);
        List<ClaimedNoteDraft> claimed = new ArrayList<>();
        try {
            for (NoteDraftData draft : noteDraftService.listDrafts(guest).drafts()) {
                ClaimedNoteDraft note = workspaceService.persistDraft(userId, draft);
                noteDraftService.deleteDraft(guest, draft.noteId());
                claimed.add(note);
            }
            log.info("[draft-claim] status=success userId={} guestId={} claimedCount={}",
                    userId, guestId, claimed.size());
            return new NoteDraftClaimData(claimed.size(), claimed);
        } catch (Exception exception) {
            log.warn("[draft-claim] status=failed userId={} guestId={} claimedCount={} reason={}",
                    userId, guestId, claimed.size(), exception.getClass().getSimpleName(), exception);
            throw exception;
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
