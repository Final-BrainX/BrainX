package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.ClaimedNoteDraft;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftClaimData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftFlushData;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

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
        List<ClaimedNoteDraft> claimed = new ArrayList<>();
        for (NoteDraftData draft : noteDraftService.listDrafts(guest).drafts()) {
            ClaimedNoteDraft note = workspaceService.persistDraft(userId, draft);
            noteDraftService.deleteDraft(guest, draft.noteId());
            claimed.add(note);
        }
        return new NoteDraftClaimData(claimed.size(), claimed);
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
        return new NoteDraftFlushData(flushed, skipped);
    }
}
