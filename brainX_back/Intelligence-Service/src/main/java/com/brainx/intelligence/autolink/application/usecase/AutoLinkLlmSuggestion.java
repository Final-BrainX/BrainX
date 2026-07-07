package com.brainx.intelligence.autolink.application.usecase;

record AutoLinkLlmSuggestion(
    String anchorText,
    String targetNoteId,
    String reason,
    double confidence
) {
}
