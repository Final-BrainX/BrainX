package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import org.springframework.data.jpa.repository.JpaRepository;

interface EvalSetJpaRepository extends JpaRepository<EvalSetJpaEntity, String> {
}
