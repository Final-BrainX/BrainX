package com.brainx.intelligence.insight.application.port.inbound;

import java.time.Instant;

import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportLatestState;

public interface GetLatestInsightReportUseCase {

    LatestInsightReport getLatestInsightReport(GetLatestInsightReportQuery query);

    record GetLatestInsightReportQuery(
        String userId,
        String documentGroupId
    ) {
    }

    record LatestInsightReport(
        String documentGroupId,
        int searchableNoteCount,
        Instant latestNoteUpdatedAt,
        InsightReportLatestState state,
        InsightReport report
    ) {
    }
}
