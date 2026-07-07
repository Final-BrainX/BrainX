package com.brainx.intelligence.connection.application.usecase;

import java.util.List;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkStrategyResult;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionResult;

final class LinkSuggestionResultMapper {

    AutoLinkStrategyResult linkSuggestionStrategy(AutoLinkResult result) {
        if (result == null || result.strategies() == null) {
            return null;
        }
        return result.strategies().stream()
            .filter(strategy -> strategy.strategy() == NoteAutoLinkStrategy.LLM_ONLY)
            .findFirst()
            .orElse(null);
    }

    List<LinkSuggestionResult> toResults(String sourceNoteId, AutoLinkStrategyResult strategy) {
        return strategy.suggestions().stream()
            .filter(suggestion -> sourceNoteId.equals(suggestion.sourceNoteId()))
            .map(suggestion -> {
                var anchor = suggestion.anchor();
                return new LinkSuggestionResult(
                    suggestion.suggestionId(),
                    suggestion.targetNoteId(),
                    suggestion.targetTitle(),
                    suggestion.confidence(),
                    suggestion.reason(),
                    anchor == null ? "" : anchor.matchedText(),
                    anchor == null ? -1 : anchor.startOffset(),
                    anchor == null ? -1 : anchor.endOffset()
                );
            })
            .toList();
    }
}
