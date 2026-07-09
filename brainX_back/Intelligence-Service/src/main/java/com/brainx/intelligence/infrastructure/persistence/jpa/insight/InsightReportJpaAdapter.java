package com.brainx.intelligence.infrastructure.persistence.jpa.insight;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import org.springframework.dao.DataIntegrityViolationException;

import com.brainx.intelligence.insight.application.port.outbound.InsightReportStore;
import com.brainx.intelligence.infrastructure.persistence.jpa.JpaConstraintViolations;
import com.brainx.intelligence.insight.domain.InsightIdempotencyConflictException;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.fasterxml.jackson.databind.ObjectMapper;

@Repository
public class InsightReportJpaAdapter implements InsightReportStore {

    private final InsightReportJpaRepository repository;
    private final ObjectMapper objectMapper;

    public InsightReportJpaAdapter(InsightReportJpaRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    public InsightReport save(InsightReport report) {
        try {
            return repository.saveAndFlush(InsightReportJpaEntity.fromDomain(report, objectMapper))
                .toDomain(objectMapper);
        } catch (DataIntegrityViolationException exception) {
            if (JpaConstraintViolations.causedBy(exception, "uk_insight_reports_user_idempotency")) {
                throw new InsightIdempotencyConflictException("The insight idempotency key is already in use.");
            }
            throw exception;
        }
    }

    @Override
    public Optional<InsightReport> findByUserIdAndReportId(String userId, String reportId) {
        return repository.findByUserIdAndReportId(userId, reportId)
            .map(entity -> entity.toDomain(objectMapper));
    }

    @Override
    public Optional<InsightReport> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey) {
        return repository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)
            .map(entity -> entity.toDomain(objectMapper));
    }

    @Override
    public List<InsightReport> findRecentByUserIdAndDocumentGroupId(String userId, String documentGroupId, int limit) {
        return repository.findByUserIdAndDocumentGroupIdOrderByCreatedAtDescReportIdDesc(
                userId,
                documentGroupId,
                PageRequest.of(0, Math.max(1, limit))
            )
            .stream()
            .map(entity -> entity.toDomain(objectMapper))
            .toList();
    }
}
