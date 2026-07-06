package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.llmops.domain.EvalScenario;
import com.brainx.intelligence.llmops.domain.EvalScenarioType;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_eval_scenarios")
public class EvalScenarioJpaEntity {

    @Id
    @Column(name = "scenario_id", nullable = false, length = 120)
    private String scenarioId;

    @Column(name = "eval_set_id", nullable = false, length = 120)
    private String evalSetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scenario_type", nullable = false, length = 60)
    private EvalScenarioType scenarioType;

    @Column(name = "name", nullable = false, length = 240)
    private String name;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "input_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> input = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "validation_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> validation = Map.of();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected EvalScenarioJpaEntity() {
    }

    static EvalScenarioJpaEntity fromDomain(EvalScenario scenario) {
        EvalScenarioJpaEntity entity = new EvalScenarioJpaEntity();
        entity.scenarioId = scenario.scenarioId();
        entity.evalSetId = scenario.evalSetId();
        entity.scenarioType = scenario.scenarioType();
        entity.name = scenario.name();
        entity.input = scenario.input();
        entity.validation = scenario.validation();
        entity.createdAt = scenario.createdAt();
        return entity;
    }

    EvalScenario toDomain() {
        return new EvalScenario(scenarioId, evalSetId, scenarioType, name, input, validation, createdAt);
    }
}
