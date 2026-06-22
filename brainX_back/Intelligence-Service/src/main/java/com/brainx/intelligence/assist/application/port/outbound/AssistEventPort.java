package com.brainx.intelligence.assist.application.port.outbound;

import com.brainx.intelligence.assist.domain.AiSuggestionDecision;

public interface AssistEventPort {

    void aiSuggestionCreated(AiSuggestionCreatedEvent event);

    void aiSuggestionDecisionRecorded(AiSuggestionDecisionRecordedEvent event);

    record AiSuggestionCreatedEvent(
        String userId,
        String suggestionId,
        String featureId,
        String noteId,
        String modelId
    ) {
    }

    record AiSuggestionDecisionRecordedEvent(
        String userId,
        String suggestionId,
        AiSuggestionDecision decision,
        String appliedNoteId
    ) {
    }
}
