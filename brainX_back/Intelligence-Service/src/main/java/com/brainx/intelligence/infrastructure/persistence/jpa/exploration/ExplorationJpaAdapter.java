package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.NoteSummary;

@Repository
public class ExplorationJpaAdapter implements NoteSummaryPort {

    private static final PageRequest SINGLE_RESULT = PageRequest.of(0, 1);

    private final NoteSummaryJpaRepository noteSummaryJpaRepository;

    public ExplorationJpaAdapter(NoteSummaryJpaRepository noteSummaryJpaRepository) {
        this.noteSummaryJpaRepository = noteSummaryJpaRepository;
    }

    @Override
    public Optional<NoteSummary> findByUserIdAndNoteId(String userId, String noteId) {
        return noteSummaryJpaRepository.findLatestByUserIdAndNoteId(userId, noteId, SINGLE_RESULT).stream()
            .findFirst()
            .map(NoteSummaryJpaEntity::toDomain);
    }

    @Override
    public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
        return noteSummaryJpaRepository.findFirstByUserIdAndDocumentGroupIdAndNoteIdOrderByGeneratedAtDesc(
                userId,
                documentGroupId,
                noteId
            )
            .map(NoteSummaryJpaEntity::toDomain);
    }

    @Override
    public Optional<NoteSummary> findByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHash(
        String userId,
        String documentGroupId,
        String noteId,
        String markdownHash
    ) {
        return noteSummaryJpaRepository.findFirstByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHashOrderByGeneratedAtDesc(
                userId,
                documentGroupId,
                noteId,
                markdownHash
            )
            .map(NoteSummaryJpaEntity::toDomain);
    }

    @Override
    public NoteSummary save(NoteSummary summary) {
        return noteSummaryJpaRepository.save(NoteSummaryJpaEntity.fromDomain(summary))
            .toDomain();
    }

    @Override
    @Transactional
    public void deleteByUserIdAndNoteId(String userId, String noteId) {
        noteSummaryJpaRepository.deleteByUserIdAndNoteId(userId, noteId);
    }
}
