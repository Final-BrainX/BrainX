package com.brainx.commerce.event.consumer;

import com.brainx.commerce.service.TokenUsageService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class TokenUsageEventListenerTest {

    @Mock
    private TokenUsageService tokenUsageService;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    private TokenUsageEventListener listener() {
        return new TokenUsageEventListener(tokenUsageService, objectMapper);
    }

    @Test
    void parsesEnvelopeAndDelegatesToIngest() {
        String json = """
                {
                  "eventId": "evt_123",
                  "eventType": "TokenUsageRecordedRequested",
                  "eventVersion": 1,
                  "occurredAt": "2026-07-02T03:04:05Z",
                  "producer": "Intelligence-Service",
                  "tenantId": null,
                  "userId": "usr_1",
                  "correlationId": "corr_1",
                  "causationId": null,
                  "idempotencyKey": "req_1",
                  "payload": {
                    "usageRequestId": "req_1",
                    "userId": "usr_1",
                    "sourceService": "Intelligence-Service",
                    "featureId": "rag-chat",
                    "modelId": "gpt-5",
                    "inputTokens": 100,
                    "cachedInputTokens": 10,
                    "billableInputTokens": 90,
                    "outputTokens": 50,
                    "reasoningTokens": 0,
                    "totalTokens": 150,
                    "estimatedInputCost": null,
                    "estimatedCachedInputCost": null,
                    "estimatedOutputCost": null,
                    "estimatedCost": 0.0012,
                    "costCurrency": "USD",
                    "causationId": "cause_1"
                  }
                }
                """;
        ConsumerRecord<String, String> record = new ConsumerRecord<>("topic", 0, 0L, "usr_1", json);

        listener().onMessage(record);

        ArgumentCaptor<Instant> occurredAtCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<TokenUsageEventListener.Payload> payloadCaptor =
                ArgumentCaptor.forClass(TokenUsageEventListener.Payload.class);
        verify(tokenUsageService).ingest(eq("evt_123"), occurredAtCaptor.capture(), payloadCaptor.capture());

        assertThat(occurredAtCaptor.getValue()).isEqualTo(Instant.parse("2026-07-02T03:04:05Z"));
        assertThat(payloadCaptor.getValue().featureId()).isEqualTo("rag-chat");
        assertThat(payloadCaptor.getValue().totalTokens()).isEqualTo(150);
        assertThat(payloadCaptor.getValue().userId()).isEqualTo("usr_1");
    }

    @Test
    void malformedJsonIsLoggedAndDoesNotPropagate() {
        ConsumerRecord<String, String> record = new ConsumerRecord<>("topic", 0, 0L, "usr_1", "not-json");

        listener().onMessage(record);

        verifyNoInteractions(tokenUsageService);
    }
}
