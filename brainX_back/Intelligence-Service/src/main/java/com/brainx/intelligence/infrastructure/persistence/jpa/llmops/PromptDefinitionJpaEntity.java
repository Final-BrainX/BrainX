package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.llmops.domain.PromptDefinition;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_prompt_definitions")
public class PromptDefinitionJpaEntity {

    @Id
    @Column(name = "prompt_key", nullable = false, length = 160)
    private String promptKey;

    @Column(name = "feature_id", length = 120)
    private String featureId;

    @Column(name = "description", length = 1000)
    private String description;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "variable_schema_json", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> variableSchema = Map.of();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PromptDefinitionJpaEntity() {
    }

    static PromptDefinitionJpaEntity fromDomain(PromptDefinition definition) {
        PromptDefinitionJpaEntity entity = new PromptDefinitionJpaEntity();
        entity.promptKey = definition.promptKey();
        entity.featureId = definition.featureId();
        entity.description = definition.description();
        entity.variableSchema = definition.variableSchema();
        entity.createdAt = definition.createdAt();
        entity.updatedAt = definition.updatedAt();
        return entity;
    }

    PromptDefinition toDomain() {
        return new PromptDefinition(promptKey, featureId, description, variableSchema, createdAt, updatedAt);
    }
}
