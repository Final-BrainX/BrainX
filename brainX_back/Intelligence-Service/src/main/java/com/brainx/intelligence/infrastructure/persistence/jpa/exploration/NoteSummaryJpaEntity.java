package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.util.StringUtils;

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

    @Column(name = "document_group_id", length = 120)
    private String documentGroupId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "summary", nullable = false)
    private String summary;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private SummarySource source;

    @Column(name = "markdown_hash", length = 160)
    private String markdownHash;

    @Column(name = "generated_at")
    private Instant generatedAt;

    @Column(name = "model_id", length = 120)
    private String modelId;

    protected NoteSummaryJpaEntity() {
    }

    public NoteSummaryJpaEntity(String userId, String noteId, String summary, SummarySource source) {
        this(userId, null, noteId, summary, source, null, null, null);
    }

    public NoteSummaryJpaEntity(
        String userId,
        String documentGroupId,
        String noteId,
        String summary,
        SummarySource source,
        String markdownHash,
        String modelId,
        Instant generatedAt
    ) {
        this.summaryId = summaryId(userId, documentGroupId, noteId);
        this.userId = userId;
        this.documentGroupId = blankToNull(documentGroupId);
        this.noteId = noteId;
        this.summary = summary;
        this.source = source;
        this.markdownHash = blankToNull(markdownHash);
        this.modelId = blankToNull(modelId);
        this.generatedAt = generatedAt;
    }

    static NoteSummaryJpaEntity fromDomain(NoteSummary noteSummary) {
        return new NoteSummaryJpaEntity(
            noteSummary.userId(),
            noteSummary.documentGroupId(),
            noteSummary.noteId(),
            noteSummary.summary(),
            noteSummary.source(),
            noteSummary.markdownHash(),
            noteSummary.modelId(),
            noteSummary.generatedAt()
        );
    }

    NoteSummary toDomain() {
        return new NoteSummary(userId, documentGroupId, noteId, summary, source, markdownHash, modelId, generatedAt);
    }

    private static String summaryId(String userId, String documentGroupId, String noteId) {
        if (!StringUtils.hasText(documentGroupId)) {
            return userId + "::" + noteId;
        }
        return "sum_" + sha256(userId + "\n" + documentGroupId + "\n" + noteId);
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }
}
