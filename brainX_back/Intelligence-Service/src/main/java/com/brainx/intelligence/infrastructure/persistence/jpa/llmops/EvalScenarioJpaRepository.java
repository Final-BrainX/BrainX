package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface EvalScenarioJpaRepository extends JpaRepository<EvalScenarioJpaEntity, String> {

    List<EvalScenarioJpaEntity> findByEvalSetIdOrderByCreatedAtAscScenarioIdAsc(String evalSetId);
}
