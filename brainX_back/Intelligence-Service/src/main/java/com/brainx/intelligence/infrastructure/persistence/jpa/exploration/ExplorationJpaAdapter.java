package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import java.util.Optional;

import org.springframework.stereotype.Repository;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.NoteSummary;

@Repository
public class ExplorationJpaAdapter implements NoteSummaryPort {

    private final NoteSummaryJpaRepository noteSummaryJpaRepository;

    public ExplorationJpaAdapter(NoteSummaryJpaRepository noteSummaryJpaRepository) {
        this.noteSummaryJpaRepository = noteSummaryJpaRepository;
    }

    @Override
    public Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId) {
        return noteSummaryJpaRepository.findByUserIdAndNoteId(userId, noteId)
            .map(NoteSummaryJpaEntity::toDomain);
    }

    @Override
    public NoteSummary save(NoteSummary summary) {
        return noteSummaryJpaRepository.save(NoteSummaryJpaEntity.fromDomain(summary))
            .toDomain();
    }
}
