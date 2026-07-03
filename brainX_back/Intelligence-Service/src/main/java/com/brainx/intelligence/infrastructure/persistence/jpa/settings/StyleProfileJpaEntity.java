package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;
import com.brainx.intelligence.settings.domain.AssistanceStyle;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_style_profiles")
public class StyleProfileJpaEntity {

    @Id
    @Column(name = "user_id", nullable = false, length = 100)
    private String userId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "style", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> style = Map.of();

    @Column(name = "detected_from_notes_at")
    private Instant detectedFromNotesAt;

    protected StyleProfileJpaEntity() {
    }

    public StyleProfileJpaEntity(
        String userId,
        Map<String, Object> style,
        Instant detectedFromNotesAt
    ) {
        this.userId = userId;
        this.style = style == null ? Map.of() : style;
        this.detectedFromNotesAt = detectedFromNotesAt;
    }

    static StyleProfileJpaEntity fromDomain(StyleProfile styleProfile) {
        return new StyleProfileJpaEntity(
            styleProfile.userId(),
            toJsonMap(styleProfile),
            styleProfile.detectedFromNotesAt()
        );
    }

    StyleProfile toDomain() {
        return new StyleProfile(
            userId,
            new ConversationTone(nestedMap(style, "conversationTone")),
            new WritingStyle(nestedMap(style, "writingStyle")),
            new AssistanceStyle(nestedMap(style, "assistanceStyle")),
            detectedFromNotesAt
        );
    }

    private static Map<String, Object> toJsonMap(StyleProfile styleProfile) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("conversationTone", styleProfile.conversationToneValues());
        values.put("writingStyle", styleProfile.writingStyleValues());
        values.put("assistanceStyle", styleProfile.assistanceStyleValues());
        return Map.copyOf(values);
    }

    private static Map<String, Object> nestedMap(Map<String, Object> source, String key) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        Object value = source.get(key);
        if (!(value instanceof Map<?, ?> rawMap)) {
            return Map.of();
        }

        Map<String, Object> nested = new LinkedHashMap<>();
        rawMap.forEach((nestedKey, nestedValue) -> {
            if (nestedKey instanceof String stringKey) {
                nested.put(stringKey, nestedValue);
            }
        });
        return nested;
    }
}
