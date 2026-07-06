package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface EvalResultJpaRepository extends JpaRepository<EvalResultJpaEntity, String> {

    List<EvalResultJpaEntity> findByEvalRunIdOrderByCreatedAtAscResultIdAsc(String evalRunId);
}
