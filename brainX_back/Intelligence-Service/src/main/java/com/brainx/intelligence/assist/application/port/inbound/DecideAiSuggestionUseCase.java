package com.brainx.intelligence.assist.application.port.inbound;

import com.brainx.intelligence.assist.domain.AiSuggestionDecision;

public interface DecideAiSuggestionUseCase {

    AiSuggestionDecisionResult decideAiSuggestion(AiSuggestionDecisionCommand command);

    record AiSuggestionDecisionCommand(
        String userId,
        String suggestionId,
        AiSuggestionDecision decision
    ) {
    }

    record AiSuggestionDecisionResult(
        String suggestionId,
        AiSuggestionDecision decision
    ) {
    }
}
