package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.brainx.intelligence.llmops.domain.PromptVersionStatus;

interface PromptVersionJpaRepository extends JpaRepository<PromptVersionJpaEntity, String> {

    Optional<PromptVersionJpaEntity> findByPromptKeyAndStatus(String promptKey, PromptVersionStatus status);

    Optional<PromptVersionJpaEntity> findByPromptKeyAndVersion(String promptKey, int version);

    List<PromptVersionJpaEntity> findByPromptKey(String promptKey);
}
