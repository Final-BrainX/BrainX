package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.llmops.domain.PromptVersion;
import com.brainx.intelligence.llmops.domain.PromptVersionStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
    name = "intelligence_prompt_versions",
    uniqueConstraints = @UniqueConstraint(name = "uk_prompt_versions_key_version", columnNames = {"prompt_key", "version"})
)
public class PromptVersionJpaEntity {

    @Id
    @Column(name = "prompt_version_id", nullable = false, length = 220)
    private String promptVersionId;

    @Column(name = "prompt_key", nullable = false, length = 160)
    private String promptKey;

    @Column(name = "version", nullable = false)
    private int version;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private PromptVersionStatus status;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "template", nullable = false)
    private String template;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "variable_schema_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> variableSchema = Map.of();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    protected PromptVersionJpaEntity() {
    }

    static PromptVersionJpaEntity fromDomain(PromptVersion version) {
        PromptVersionJpaEntity entity = new PromptVersionJpaEntity();
        entity.promptVersionId = version.promptVersionId();
        entity.promptKey = version.promptKey();
        entity.version = version.version();
        entity.status = version.status();
        entity.template = version.template();
        entity.variableSchema = version.variableSchema();
        entity.createdAt = version.createdAt();
        entity.activatedAt = version.activatedAt();
        return entity;
    }

    void archive() {
        status = PromptVersionStatus.ARCHIVED;
    }

    void activate(Instant activatedAt) {
        status = PromptVersionStatus.ACTIVE;
        this.activatedAt = activatedAt;
    }

    PromptVersion toDomain() {
        return new PromptVersion(promptVersionId, promptKey, version, status, template, variableSchema, createdAt, activatedAt);
    }
}
