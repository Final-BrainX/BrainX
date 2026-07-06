package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;

import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "intelligence_llm_feedback",
    uniqueConstraints = @UniqueConstraint(name = "uk_llm_feedback_user_run", columnNames = {"user_id", "llm_run_id"})
)
public class LlmFeedbackJpaEntity {

    @Id
    @Column(name = "feedback_id", nullable = false, length = 120)
    private String feedbackId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Column(name = "llm_run_id", nullable = false, length = 120)
    private String llmRunId;

    @Enumerated(EnumType.STRING)
    @Column(name = "rating", nullable = false, length = 20)
    private LlmFeedbackRating rating;

    @Column(name = "reason_code", length = 80)
    private String reasonCode;

    @Column(name = "comment", length = 1000)
    private String comment;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LlmFeedbackJpaEntity() {
    }

    static LlmFeedbackJpaEntity fromDomain(LlmFeedback feedback) {
        LlmFeedbackJpaEntity entity = new LlmFeedbackJpaEntity();
        entity.feedbackId = feedback.feedbackId();
        entity.userId = feedback.userId();
        entity.llmRunId = feedback.llmRunId();
        entity.rating = feedback.rating();
        entity.reasonCode = feedback.reasonCode();
        entity.comment = feedback.comment();
        entity.createdAt = feedback.createdAt();
        entity.updatedAt = feedback.updatedAt();
        return entity;
    }

    void update(LlmFeedback feedback) {
        rating = feedback.rating();
        reasonCode = feedback.reasonCode();
        comment = feedback.comment();
        updatedAt = feedback.updatedAt();
    }

    LlmFeedback toDomain() {
        return new LlmFeedback(feedbackId, userId, llmRunId, rating, reasonCode, comment, createdAt, updatedAt);
    }
}
