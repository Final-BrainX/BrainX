package com.brainx.intelligence.exploration.domain;

import java.util.List;

public record NoteSearchDocument(
    String userId,
    String noteId,
    String chunkId,
    int chunkIndex,
    String title,
    String excerpt,
    String chunkText,
    List<String> keywordIds,
    String markdownHash,
    Integer version
) {

    public NoteSearchDocument(String userId, String noteId, String title, String excerpt, List<String> keywordIds) {
        this(userId, noteId, null, 0, title, excerpt, excerpt, keywordIds, null, null);
    }

    public NoteSearchDocument {
        userId = ExplorationValidation.requireText(userId, "userId");
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        if (chunkIndex < 0) {
            throw new ExplorationDomainException("chunkIndex must not be negative.");
        }
        chunkId = normalizeChunkId(chunkId, noteId, chunkIndex);
        title = ExplorationValidation.requireText(title, "title");
        excerpt = excerpt == null ? "" : excerpt;
        chunkText = normalizeChunkText(chunkText, excerpt, title);
        keywordIds = keywordIds == null ? List.of() : keywordIds.stream()
            .filter(value -> value != null && !value.isBlank())
            .distinct()
            .toList();
    }

    private static String normalizeChunkId(String chunkId, String noteId, int chunkIndex) {
        if (chunkId != null && !chunkId.isBlank()) {
            return chunkId;
        }
        return noteId + "::" + chunkIndex;
    }

    private static String normalizeChunkText(String chunkText, String excerpt, String title) {
        if (chunkText != null && !chunkText.isBlank()) {
            return chunkText;
        }
        if (excerpt != null && !excerpt.isBlank()) {
            return excerpt;
        }
        return title;
    }
}
