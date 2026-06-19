package com.brainx.intelligence.exploration.domain;

import java.util.List;

public record NoteSearchDocument(
    String userId,
    String noteId,
    String title,
    String excerpt,
    List<String> keywordIds
) {

    public NoteSearchDocument {
        userId = ExplorationValidation.requireText(userId, "userId");
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        title = ExplorationValidation.requireText(title, "title");
        excerpt = excerpt == null ? "" : excerpt;
        keywordIds = keywordIds == null ? List.of() : keywordIds.stream()
            .filter(value -> value != null && !value.isBlank())
            .toList();
    }
}
