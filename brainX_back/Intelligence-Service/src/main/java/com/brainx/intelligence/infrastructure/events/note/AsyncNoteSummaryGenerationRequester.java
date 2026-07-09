package com.brainx.intelligence.infrastructure.events.note;

import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GenerateNoteSummaryCommand;

@Component
class AsyncNoteSummaryGenerationRequester implements NoteSummaryGenerationRequester {

    private static final Logger log = LoggerFactory.getLogger(AsyncNoteSummaryGenerationRequester.class);

    private final GetNoteSummaryUseCase getNoteSummaryUseCase;

    AsyncNoteSummaryGenerationRequester(GetNoteSummaryUseCase getNoteSummaryUseCase) {
        this.getNoteSummaryUseCase = getNoteSummaryUseCase;
    }

    @Override
    public void requestGeneration(String userId, String documentGroupId, String noteId) {
        CompletableFuture.runAsync(() -> {
            try {
                getNoteSummaryUseCase.generateNoteSummary(new GenerateNoteSummaryCommand(
                    userId,
                    noteId,
                    documentGroupId,
                    false
                ));
            } catch (RuntimeException exception) {
                log.debug("Skipping async note summary generation for noteId={}: {}", noteId, exception.getMessage());
            }
        });
    }
}
