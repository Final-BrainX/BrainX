package com.brainx.intelligence.infrastructure.persistence.jpa.insight;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

interface InsightReportJpaRepository extends JpaRepository<InsightReportJpaEntity, String> {

    Optional<InsightReportJpaEntity> findByUserIdAndReportId(String userId, String reportId);

    Optional<InsightReportJpaEntity> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);

    List<InsightReportJpaEntity> findByUserIdAndDocumentGroupIdOrderByCreatedAtDescReportIdDesc(
        String userId,
        String documentGroupId,
        Pageable pageable
    );
}
