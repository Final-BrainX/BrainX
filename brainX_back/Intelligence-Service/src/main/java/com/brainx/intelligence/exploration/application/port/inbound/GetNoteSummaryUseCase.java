package com.brainx.intelligence.exploration.application.port.inbound;

import com.brainx.intelligence.exploration.domain.SummarySource;

public interface GetNoteSummaryUseCase {

    NoteSummaryResult getNoteSummary(GetNoteSummaryQuery query);

    record GetNoteSummaryQuery(
        String userId,
        String noteId
    ) {
    }

    record NoteSummaryResult(
        String noteId,
        String summary,
        SummarySource source
    ) {
    }
}
