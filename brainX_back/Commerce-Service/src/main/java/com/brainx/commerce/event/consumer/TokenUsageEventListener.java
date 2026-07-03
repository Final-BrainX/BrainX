package com.brainx.commerce.event.consumer;

import com.brainx.commerce.service.TokenUsageService;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Intelligence-Service가 발행하는 TokenUsageRecordedRequested를 구독한다.
 * Intelligence-Service 쪽에도 별도 EventEnvelope 클래스가 없고 Map으로 조립해 보내므로,
 * 여기서도 필요한 필드만 담은 최소 record로 직접 역직렬화한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "brainx.events.consumer", name = "enabled", havingValue = "true")
public class TokenUsageEventListener {

    private final TokenUsageService tokenUsageService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "${brainx.events.consumer.topic}", groupId = "${brainx.events.consumer.group-id}")
    public void onMessage(ConsumerRecord<String, String> record) {
        try {
            Envelope envelope = objectMapper.readValue(record.value(), Envelope.class);
            if (envelope.payload() == null) {
                log.warn("TokenUsageRecordedRequested without payload skipped: eventId={}", envelope.eventId());
                return;
            }
            tokenUsageService.ingest(envelope.eventId(), envelope.occurredAt(), envelope.payload());
        } catch (Exception exception) {
            log.error("Failed to process TokenUsageRecordedRequested: key={}, error={}",
                    record.key(), exception.getMessage(), exception);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Envelope(String eventId, Instant occurredAt, Payload payload) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Payload(
            String usageRequestId,
            String userId,
            String sourceService,
            String featureId,
            String modelId,
            int inputTokens,
            int cachedInputTokens,
            int billableInputTokens,
            int outputTokens,
            int reasoningTokens,
            int totalTokens,
            BigDecimal estimatedInputCost,
            BigDecimal estimatedCachedInputCost,
            BigDecimal estimatedOutputCost,
            BigDecimal estimatedCost,
            String costCurrency,
            String causationId
    ) {
    }
}
