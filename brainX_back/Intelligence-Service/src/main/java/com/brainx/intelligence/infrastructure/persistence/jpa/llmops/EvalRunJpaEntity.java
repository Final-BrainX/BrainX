package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;

import com.brainx.intelligence.llmops.domain.EvalFailureType;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalRunStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_eval_runs")
public class EvalRunJpaEntity {

    @Id
    @Column(name = "eval_run_id", nullable = false, length = 120)
    private String evalRunId;

    @Column(name = "eval_set_id", nullable = false, length = 120)
    private String evalSetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private EvalRunStatus status;

    @Column(name = "model_id", length = 120)
    private String modelId;

    @Column(name = "scenario_count", nullable = false)
    private int scenarioCount;

    @Column(name = "passed_count", nullable = false)
    private int passedCount;

    @Column(name = "failed_count", nullable = false)
    private int failedCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "failure_type", length = 40)
    private EvalFailureType failureType;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected EvalRunJpaEntity() {
    }

    static EvalRunJpaEntity fromDomain(EvalRun run) {
        EvalRunJpaEntity entity = new EvalRunJpaEntity();
        entity.evalRunId = run.evalRunId();
        entity.evalSetId = run.evalSetId();
        entity.status = run.status();
        entity.modelId = run.modelId();
        entity.scenarioCount = run.scenarioCount();
        entity.passedCount = run.passedCount();
        entity.failedCount = run.failedCount();
        entity.failureType = run.failureType();
        entity.failureMessage = run.failureMessage();
        entity.createdAt = run.createdAt();
        entity.completedAt = run.completedAt();
        return entity;
    }

    EvalRun toDomain() {
        return new EvalRun(evalRunId, evalSetId, status, modelId, scenarioCount, passedCount, failedCount, failureType, failureMessage, createdAt, completedAt);
    }
}
