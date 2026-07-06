package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface LlmFeedbackJpaRepository extends JpaRepository<LlmFeedbackJpaEntity, String> {

    Optional<LlmFeedbackJpaEntity> findByUserIdAndLlmRunId(String userId, String llmRunId);

    @Query("""
        select feedback
        from LlmFeedbackJpaEntity feedback
        where (:userId is null or feedback.userId = :userId)
          and (:llmRunId is null or feedback.llmRunId = :llmRunId)
        order by feedback.updatedAt desc, feedback.feedbackId desc
        """)
    List<LlmFeedbackJpaEntity> listFeedback(
        @Param("userId") String userId,
        @Param("llmRunId") String llmRunId,
        Pageable pageable
    );
}
