package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SummarySource;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "exploration_note_summaries")
public class NoteSummaryJpaEntity {

    @Id
    @Column(name = "summary_id", nullable = false, length = 240)
    private String summaryId;

    @Column(name = "user_id", nullable = false, length = 100)
    private String userId;

    @Column(name = "note_id", nullable = false, length = 100)
    private String noteId;

    @Lob
    @Column(name = "summary", nullable = false)
    private String summary;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private SummarySource source;

    protected NoteSummaryJpaEntity() {
    }

    public NoteSummaryJpaEntity(String userId, String noteId, String summary, SummarySource source) {
        this.summaryId = summaryId(userId, noteId);
        this.userId = userId;
        this.noteId = noteId;
        this.summary = summary;
        this.source = source;
    }

    static NoteSummaryJpaEntity fromDomain(NoteSummary noteSummary) {
        return new NoteSummaryJpaEntity(
            noteSummary.userId(),
            noteSummary.noteId(),
            noteSummary.summary(),
            noteSummary.source()
        );
    }

    NoteSummary toDomain() {
        return new NoteSummary(userId, noteId, summary, source);
    }

    private static String summaryId(String userId, String noteId) {
        return userId + "::" + noteId;
    }
}
