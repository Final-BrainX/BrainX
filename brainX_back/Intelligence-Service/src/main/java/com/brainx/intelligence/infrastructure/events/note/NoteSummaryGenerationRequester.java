package com.brainx.intelligence.infrastructure.events.note;

public interface NoteSummaryGenerationRequester {

    void requestGeneration(String userId, String documentGroupId, String noteId);
}
