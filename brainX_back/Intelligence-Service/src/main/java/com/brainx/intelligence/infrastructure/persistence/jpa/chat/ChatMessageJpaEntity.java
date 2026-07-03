package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.brainx.intelligence.chat.domain.ChatCitation;
import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatRole;
import com.brainx.intelligence.chat.domain.ChatTokenUsage;
import com.brainx.intelligence.infrastructure.persistence.jpa.JsonListMapAttributeConverter;
import com.brainx.intelligence.infrastructure.persistence.jpa.JsonMapAttributeConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "intelligence_chat_messages")
public class ChatMessageJpaEntity {

    @Id
    @Column(name = "message_id", nullable = false, length = 120)
    private String messageId;

    @Column(name = "thread_id", nullable = false, length = 120)
    private String threadId;

    @Column(name = "user_id", nullable = false, length = 120)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private ChatRole role;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "content", nullable = false)
    private String content;

    @Column(name = "model_id", length = 120)
    private String modelId;

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "note_scope", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> noteScope = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "client_context", nullable = false)
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> clientContext = Map.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "citations", nullable = false)
    @Convert(converter = JsonListMapAttributeConverter.class)
    private List<Map<String, Object>> citations = List.of();

    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "token_usage")
    @Convert(converter = JsonMapAttributeConverter.class)
    private Map<String, Object> tokenUsage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ChatMessageJpaEntity() {
    }

    static ChatMessageJpaEntity fromDomain(ChatMessage message) {
        ChatMessageJpaEntity entity = new ChatMessageJpaEntity();
        entity.messageId = message.messageId();
        entity.threadId = message.threadId();
        entity.userId = message.userId();
        entity.role = message.role();
        entity.content = message.content();
        entity.modelId = message.modelId();
        entity.noteScope = message.noteScope();
        entity.clientContext = message.clientContext();
        entity.citations = message.citations().stream()
            .map(ChatCitation::toMap)
            .toList();
        entity.tokenUsage = message.tokenUsage() == null ? null : message.tokenUsage().toMap();
        entity.createdAt = message.createdAt();
        return entity;
    }

    ChatMessage toDomain() {
        return new ChatMessage(
            messageId,
            threadId,
            userId,
            role,
            content,
            modelId,
            noteScope,
            clientContext,
            citations.stream().map(ChatMessageJpaEntity::citationFromMap).toList(),
            tokenUsage == null || tokenUsage.isEmpty() ? null : tokenUsageFromMap(tokenUsage),
            createdAt
        );
    }

    String content() {
        return content;
    }

    private static ChatCitation citationFromMap(Map<String, Object> values) {
        return new ChatCitation(
            stringValue(values, "noteId"),
            stringValue(values, "documentGroupId"),
            stringValue(values, "chunkId"),
            intValue(values, "chunkIndex"),
            stringValue(values, "title"),
            nullableString(values, "sourcePath"),
            nullableString(values, "sourceFilename"),
            doubleValue(values, "score")
        );
    }

    private static ChatTokenUsage tokenUsageFromMap(Map<String, Object> values) {
        return new ChatTokenUsage(
            intValue(values, "inputTokens"),
            intValue(values, "cachedInputTokens"),
            intValue(values, "billableInputTokens"),
            intValue(values, "outputTokens"),
            intValue(values, "reasoningTokens"),
            intValue(values, "totalTokens"),
            bigDecimalValue(values, "estimatedInputCost"),
            bigDecimalValue(values, "estimatedCachedInputCost"),
            bigDecimalValue(values, "estimatedOutputCost"),
            bigDecimalValue(values, "estimatedCost"),
            nullableString(values, "costCurrency")
        );
    }

    private static String stringValue(Map<String, Object> values, String key) {
        String value = nullableString(values, key);
        return value == null ? "" : value;
    }

    private static String nullableString(Map<String, Object> values, String key) {
        Object value = values == null ? null : values.get(key);
        if (value == null) {
            return null;
        }
        String text = value.toString();
        return text.isBlank() ? null : text;
    }

    private static int intValue(Map<String, Object> values, String key) {
        Object value = values == null ? null : values.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Integer.parseInt(text);
        }
        return 0;
    }

    private static double doubleValue(Map<String, Object> values, String key) {
        Object value = values == null ? null : values.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Double.parseDouble(text);
        }
        return 0.0d;
    }

    private static BigDecimal bigDecimalValue(Map<String, Object> values, String key) {
        Object value = values == null ? null : values.get(key);
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (value instanceof String text && !text.isBlank()) {
            return new BigDecimal(text);
        }
        return null;
    }

    Map<String, Object> tokenUsage() {
        return tokenUsage == null ? Map.of() : new LinkedHashMap<>(tokenUsage);
    }
}
