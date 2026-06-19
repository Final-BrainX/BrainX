package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface NoteSummaryJpaRepository extends JpaRepository<NoteSummaryJpaEntity, String> {

    Optional<NoteSummaryJpaEntity> findByUserIdAndNoteId(String userId, String noteId);
}
