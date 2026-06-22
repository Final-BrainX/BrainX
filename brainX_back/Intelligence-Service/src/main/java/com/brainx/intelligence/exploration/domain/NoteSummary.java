package com.brainx.intelligence.exploration.domain;

public record NoteSummary(
    String userId,
    String noteId,
    String summary,
    SummarySource source
) {

    private static final int EXCERPT_MAX_LENGTH = 240;
    private static final String EMPTY_SUMMARY = "요약할 내용이 없습니다.";

    public NoteSummary {
        userId = ExplorationValidation.requireText(userId, "userId");
        noteId = ExplorationValidation.requireText(noteId, "noteId");
        summary = ExplorationValidation.requireText(summary, "summary");
        source = source == null ? SummarySource.EXCERPT : source;
    }

    public static NoteSummary ai(String userId, String noteId, String summary) {
        return new NoteSummary(userId, noteId, summary, SummarySource.AI);
    }

    public static NoteSummary excerptFrom(String userId, String noteId, String title, String markdown) {
        String normalizedMarkdown = normalize(markdown);
        String normalizedTitle = normalize(title);
        String sourceText = normalizedMarkdown.isBlank() ? normalizedTitle : normalizedMarkdown;
        if (sourceText.isBlank()) {
            sourceText = EMPTY_SUMMARY;
        }
        return new NoteSummary(userId, noteId, trimToExcerpt(sourceText), SummarySource.EXCERPT);
    }

    private static String normalize(String value) {
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
