package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import org.springframework.data.jpa.repository.JpaRepository;

interface PromptDefinitionJpaRepository extends JpaRepository<PromptDefinitionJpaEntity, String> {
}
