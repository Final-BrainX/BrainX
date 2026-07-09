package com.brainx.intelligence.exploration.domain;

import java.time.Instant;

public record NoteSummary(
    String userId,
    String documentGroupId,
    String noteId,
    String summary,
    SummarySource source,
    String markdownHash,
    String modelId,
    Instant generatedAt
) {

    private static final int EXCERPT_MAX_LENGTH = 240;
    private static final String EMPTY_SUMMARY = "요약할 내용이 없습니다.";

    public NoteSummary {
        userId = ExplorationValidation.requireText(userId, "userId");
        documentGroupId = normalizeIdentifier(documentGroupId);
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        summary = ExplorationValidation.requireText(summary, "summary");
        source = source == null ? SummarySource.EXCERPT : source;
        markdownHash = normalizeIdentifier(markdownHash);
        modelId = normalizeIdentifier(modelId);
    }

    public static NoteSummary ai(String userId, String noteId, String summary) {
        return new NoteSummary(userId, null, noteId, summary, SummarySource.AI, null, null, null);
    }

    public static NoteSummary ai(
        String userId,
        String documentGroupId,
        String noteId,
        String summary,
        String markdownHash,
        String modelId,
        Instant generatedAt
    ) {
        return new NoteSummary(userId, documentGroupId, noteId, summary, SummarySource.AI, markdownHash, modelId, generatedAt);
    }

    public static NoteSummary excerptFrom(String userId, String noteId, String title, String markdown) {
        String normalizedMarkdown = normalizeSummaryText(markdown);
        String normalizedTitle = normalizeSummaryText(title);
        String sourceText = normalizedMarkdown.isBlank() ? normalizedTitle : normalizedMarkdown;
        if (sourceText.isBlank()) {
            sourceText = EMPTY_SUMMARY;
        }
        return new NoteSummary(userId, null, noteId, trimToExcerpt(sourceText), SummarySource.EXCERPT, null, null, null);
    }

    public static NoteSummary excerptFrom(String userId, String documentGroupId, String noteId, String title, String markdown) {
        NoteSummary summary = excerptFrom(userId, noteId, title, markdown);
        return new NoteSummary(
            summary.userId(),
            documentGroupId,
            summary.noteId(),
            summary.summary(),
            summary.source(),
            summary.markdownHash(),
            summary.modelId(),
            summary.generatedAt()
        );
    }

    private static String normalizeIdentifier(String value) {
        if (value == null) {
            return "";
        }
        return value.trim();
    }

    private static String normalizeSummaryText(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replaceAll("[#>*_`\\[\\]()]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String trimToExcerpt(String value) {
        if (value.length() <= EXCERPT_MAX_LENGTH) {
            return value;
        }
        return value.substring(0, EXCERPT_MAX_LENGTH).trim() + "...";
    }
}
