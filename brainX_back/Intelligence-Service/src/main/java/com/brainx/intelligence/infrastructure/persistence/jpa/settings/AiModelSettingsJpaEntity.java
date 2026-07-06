package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.settings.domain.AiModelSettings;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_ai_model_settings")
public class AiModelSettingsJpaEntity {

    @Id
    @Column(name = "user_id", nullable = false, length = 100)
    private String userId;

    @Column(name = "default_model_id", nullable = false, length = 100)
    private String defaultModelId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "user_api_keys", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> userApiKeys = Map.of();

    protected AiModelSettingsJpaEntity() {
    }

    public AiModelSettingsJpaEntity(
        String userId,
        String defaultModelId,
        Map<String, Object> userApiKeys
    ) {
        this.userId = userId;
        this.defaultModelId = defaultModelId;
        this.userApiKeys = userApiKeys == null ? Map.of() : userApiKeys;
    }

    static AiModelSettingsJpaEntity fromDomain(AiModelSettings settings) {
        return new AiModelSettingsJpaEntity(
            settings.userId(),
            settings.defaultModelId(),
            settings.userApiKeys()
        );
    }

    AiModelSettings toDomain() {
        return new AiModelSettings(userId, defaultModelId, userApiKeys);
    }
}
