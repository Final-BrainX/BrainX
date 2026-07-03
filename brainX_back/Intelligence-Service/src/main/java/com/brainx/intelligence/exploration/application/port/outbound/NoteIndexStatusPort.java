package com.brainx.intelligence.exploration.application.port.outbound;

import java.time.Instant;
import java.util.List;

public interface NoteIndexStatusPort {

    List<NoteIndexStatusProjection> findNoteIndexStatuses(String userId, String documentGroupId, List<String> noteIds);

    record NoteIndexStatusProjection(
        String noteId,
        String searchIndexStatus,
        boolean availableForAiFeatures,
        Instant indexedAt
    ) {
    }
}
