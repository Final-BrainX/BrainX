package com.brainx.intelligence.exploration.domain;

public record NoteChunkSearchResult(
    String userId,
    String noteId,
    String chunkId,
    int chunkIndex,
    String title,
    String text,
    double score,
    String markdownHash,
    Integer version
) {

    public NoteChunkSearchResult {
        userId = userId == null ? "" : userId;
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        chunkId = ExplorationValidation.requireText(chunkId, "chunkId");
        if (chunkIndex < 0) {
            throw new ExplorationDomainException("chunkIndex must not be negative.");
        }
        title = title == null ? "" : title;
        text = text == null ? "" : text;
    }
}
