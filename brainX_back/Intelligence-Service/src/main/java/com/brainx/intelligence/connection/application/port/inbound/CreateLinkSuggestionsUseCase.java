package com.brainx.intelligence.connection.application.port.inbound;

import java.util.List;

public interface CreateLinkSuggestionsUseCase {

    LinkSuggestionsResult createLinkSuggestions(LinkSuggestionsCommand command);

    record LinkSuggestionsCommand(
        String userId,
        String documentGroupId,
        String noteId
    ) {
    }

    record LinkSuggestionsResult(
        String llmRunId,
        List<LinkSuggestionResult> suggestions
    ) {
        public LinkSuggestionsResult(List<LinkSuggestionResult> suggestions) {
            this(null, suggestions);
        }

        public LinkSuggestionsResult {
            suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        }
    }

    record LinkSuggestionResult(
        String suggestionId,
        String targetNoteId,
        String targetTitle,
        double score,
        String reason,
        String anchorText,
        int anchorStartOffset,
        int anchorEndOffset
    ) {
    }
}
