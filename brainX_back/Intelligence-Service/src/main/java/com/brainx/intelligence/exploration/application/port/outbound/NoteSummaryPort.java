package com.brainx.intelligence.exploration.application.port.outbound;

import java.util.Optional;

import com.brainx.intelligence.exploration.domain.NoteSummary;

public interface NoteSummaryPort {

    Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId);

    Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId);

    Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHash(
        String userId,
        String documentGroupId,
        String noteId,
        String markdownHash
    );

    NoteSummary save(NoteSummary summary);

    void deleteByUserIdAndNoteId(String userId, String noteId);
}
