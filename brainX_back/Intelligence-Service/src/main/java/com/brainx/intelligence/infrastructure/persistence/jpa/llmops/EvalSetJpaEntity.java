package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;

import com.brainx.intelligence.llmops.domain.EvalSet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_eval_sets")
public class EvalSetJpaEntity {

    @Id
    @Column(name = "eval_set_id", nullable = false, length = 120)
    private String evalSetId;

    @Column(name = "name", nullable = false, length = 240)
    private String name;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected EvalSetJpaEntity() {
    }

    static EvalSetJpaEntity fromDomain(EvalSet evalSet) {
        EvalSetJpaEntity entity = new EvalSetJpaEntity();
        entity.evalSetId = evalSet.evalSetId();
        entity.name = evalSet.name();
        entity.description = evalSet.description();
        entity.createdAt = evalSet.createdAt();
        return entity;
    }

    EvalSet toDomain() {
        return new EvalSet(evalSetId, name, description, createdAt);
    }
}
