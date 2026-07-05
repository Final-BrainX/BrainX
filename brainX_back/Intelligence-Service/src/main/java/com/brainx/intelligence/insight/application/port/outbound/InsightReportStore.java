package com.brainx.intelligence.insight.application.port.outbound;

import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.insight.domain.InsightReport;

public interface InsightReportStore {

    InsightReport save(InsightReport report);

    Optional<InsightReport> findByUserIdAndReportId(String userId, String reportId);

    Optional<InsightReport> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    List<InsightReport> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit);
}
