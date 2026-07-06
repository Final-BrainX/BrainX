package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.llmops.domain.EvalFailureType;
import com.brainx.intelligence.llmops.domain.EvalResult;
import com.brainx.intelligence.llmops.domain.EvalResultStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_eval_results")
public class EvalResultJpaEntity {

    @Id
    @Column(name = "result_id", nullable = false, length = 120)
    private String resultId;

    @Column(name = "eval_run_id", nullable = false, length = 120)
    private String evalRunId;

    @Column(name = "scenario_id", nullable = false, length = 120)
    private String scenarioId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private EvalResultStatus status;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "output_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> output = Map.of();

    @Enumerated(EnumType.STRING)
    @Column(name = "failure_type", length = 40)
    private EvalFailureType failureType;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Column(name = "llm_run_id", length = 120)
    private String llmRunId;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected EvalResultJpaEntity() {
    }

    static EvalResultJpaEntity fromDomain(EvalResult result) {
        EvalResultJpaEntity entity = new EvalResultJpaEntity();
        entity.resultId = result.resultId();
        entity.evalRunId = result.evalRunId();
        entity.scenarioId = result.scenarioId();
        entity.status = result.status();
        entity.output = result.output();
        entity.failureType = result.failureType();
        entity.failureMessage = result.failureMessage();
        entity.llmRunId = result.llmRunId();
        entity.latencyMs = result.latencyMs();
        entity.createdAt = result.createdAt();
        return entity;
    }

    EvalResult toDomain() {
        return new EvalResult(resultId, evalRunId, scenarioId, status, output, failureType, failureMessage, llmRunId, latencyMs, createdAt);
    }
}
