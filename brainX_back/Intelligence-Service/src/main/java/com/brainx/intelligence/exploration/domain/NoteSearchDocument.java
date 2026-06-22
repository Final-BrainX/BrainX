package com.brainx.intelligence.exploration.domain;

import java.util.List;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record NoteSearchDocument(
    String userId,
    String documentGroupId,
    String noteId,
    String chunkId,
    int chunkIndex,
    String title,
    String excerpt,
    String chunkText,
    List<String> keywordIds,
    String markdownHash,
    Integer version,
    String sourcePath,
    String sourceFilename
) {

    public NoteSearchDocument(String userId, String noteId, String title, String excerpt, List<String> keywordIds) {
        this(userId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, noteId, null, 0, title, excerpt, excerpt, keywordIds, null, null, null, null);
    }

    public NoteSearchDocument(
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
        this(userId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, noteId, chunkId, chunkIndex, title, excerpt, chunkText, keywordIds, markdownHash, version, null, null);
    }

    public NoteSearchDocument(
        String userId,
        String noteId,
        String chunkId,
        int chunkIndex,
        String title,
        String excerpt,
        String chunkText,
        List<String> keywordIds,
        String markdownHash,
        Integer version,
        String sourcePath,
        String sourceFilename
    ) {
        this(userId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, noteId, chunkId, chunkIndex, title, excerpt, chunkText, keywordIds, markdownHash, version, sourcePath, sourceFilename);
    }

    public NoteSearchDocument {
        userId = ExplorationValidation.requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
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
        sourcePath = normalizeOptionalText(sourcePath);
        sourceFilename = normalizeOptionalText(sourceFilename);
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

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
