package com.brainx.intelligence.exploration.application.port.inbound;

import java.time.Instant;

import com.brainx.intelligence.exploration.domain.SummarySource;

public interface GetNoteSummaryUseCase {

    NoteSummaryResult getNoteSummary(GetNoteSummaryQuery query);

    NoteSummaryResult generateNoteSummary(GenerateNoteSummaryCommand command);

    record GetNoteSummaryQuery(
        String userId,
        String noteId
    ) {
    }

    record GenerateNoteSummaryCommand(
        String userId,
        String noteId,
        String documentGroupId,
        boolean force
    ) {
    }

    record NoteSummaryResult(
        String noteId,
        String summary,
        SummarySource source,
        String documentGroupId,
        String markdownHash,
        Instant generatedAt,
        String modelId
    ) {
        public NoteSummaryResult(String noteId, String summary, SummarySource source) {
            this(noteId, summary, source, null, null, null, null);
        }
    }
}
