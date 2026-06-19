package com.brainx.intelligence.infrastructure.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

class BrainxEventDispatcherTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void validEnvelopeInvokesHandlerAndMarksProcessed() {
        RecordingHandler handler = new RecordingHandler("NoteCreated");
        FakeStore store = new FakeStore();
        BrainxEventDispatcher dispatcher = new BrainxEventDispatcher(objectMapper, store, List.of(handler));

        EventDispatchResult result = dispatcher.dispatch(envelope("evt-1", "NoteCreated"));

        assertThat(result.status()).isEqualTo(EventConsumptionStatus.PROCESSED);
        assertThat(handler.invocations).isEqualTo(1);
        assertThat(store.records.get("evt-1").status()).isEqualTo(EventConsumptionStatus.PROCESSED);
    }

    @Test
    void processedEventIsSkippedWithoutInvokingHandlerAgain() {
        RecordingHandler handler = new RecordingHandler("NoteCreated");
        FakeStore store = new FakeStore();
        store.records.put("evt-1", new EventConsumptionRecord(
            "evt-1",
            "NoteCreated",
            EventConsumptionStatus.PROCESSED,
            1,
            null,
            null,
            Instant.now(),
            Instant.now(),
            null
        ));
        BrainxEventDispatcher dispatcher = new BrainxEventDispatcher(objectMapper, store, List.of(handler));

        EventDispatchResult result = dispatcher.dispatch(envelope("evt-1", "NoteCreated"));

        assertThat(result.handlerInvoked()).isFalse();
        assertThat(handler.invocations).isZero();
    }

    @Test
    void missingHandlerMarksNonRetryableFailure() {
        FakeStore store = new FakeStore();
        BrainxEventDispatcher dispatcher = new BrainxEventDispatcher(objectMapper, store, List.of());

        EventDispatchResult result = dispatcher.dispatch(envelope("evt-1", "NoteCreated"));

        assertThat(result.status()).isEqualTo(EventConsumptionStatus.FAILED_NON_RETRYABLE);
        assertThat(store.records.get("evt-1").errorCode()).isEqualTo("NO_HANDLER");
    }

    @Test
    void invalidJsonIsStoredAsPoisonWithoutRawSecret() {
        FakeStore store = new FakeStore();
        BrainxEventDispatcher dispatcher = new BrainxEventDispatcher(objectMapper, store, List.of());

        EventDispatchResult result = dispatcher.dispatch("{\"apiKey\":\"pa-secret-value\"");

        assertThat(result.status()).isEqualTo(EventConsumptionStatus.FAILED_NON_RETRYABLE);
        EventConsumptionRecord poison = store.records.values().iterator().next();
        assertThat(poison.eventId()).startsWith("poison::");
        assertThat(poison.errorMessage()).doesNotContain("pa-secret-value");
    }

    @Test
    void retryableHandlerFailureIsRecordedAndRethrown() {
        BrainxEventHandler handler = new BrainxEventHandler() {
            @Override
            public Set<String> eventTypes() {
                return Set.of("NoteCreated");
            }

            @Override
            public void handle(EventProcessingContext context) {
                throw EventProcessingException.retryable("SNAPSHOT_UNAVAILABLE", "Bearer very-secret-token");
            }
        };
        FakeStore store = new FakeStore();
        BrainxEventDispatcher dispatcher = new BrainxEventDispatcher(objectMapper, store, List.of(handler));

        assertThatThrownBy(() -> dispatcher.dispatch(envelope("evt-1", "NoteCreated")))
            .isInstanceOf(EventProcessingException.class);

        EventConsumptionRecord record = store.records.get("evt-1");
        assertThat(record.status()).isEqualTo(EventConsumptionStatus.FAILED_RETRYABLE);
        assertThat(record.errorCode()).isEqualTo("SNAPSHOT_UNAVAILABLE");
        assertThat(record.errorMessage()).doesNotContain("very-secret-token");
    }

    private static String envelope(String eventId, String eventType) {
        return """
            {
              "eventId": "%s",
              "eventType": "%s",
              "eventVersion": 1,
              "occurredAt": "2026-06-19T00:00:00Z",
              "producer": "Workspace-Service",
              "userId": "user-1",
              "correlationId": "corr-1",
              "payload": {
                "noteId": "note-1",
                "userId": "user-1",
                "title": "Title",
                "version": 1
              }
            }
            """.formatted(eventId, eventType);
    }

    private static final class RecordingHandler implements BrainxEventHandler {

        private final String eventType;
        private int invocations;

        private RecordingHandler(String eventType) {
            this.eventType = eventType;
        }

        @Override
        public Set<String> eventTypes() {
            return Set.of(eventType);
        }

        @Override
        public void handle(EventProcessingContext context) {
            invocations++;
        }
    }

    private static final class FakeStore implements EventConsumptionStore {

        private final Map<String, EventConsumptionRecord> records = new LinkedHashMap<>();

        @Override
        public Optional<EventConsumptionRecord> findByEventId(String eventId) {
            return Optional.ofNullable(records.get(eventId));
        }

        @Override
        public EventConsumptionRecord markProcessing(BrainxEventEnvelope envelope, String payloadHash) {
            EventConsumptionRecord existing = records.get(envelope.eventId());
            int attempts = existing == null ? 1 : existing.attempts() + 1;
            EventConsumptionRecord record = new EventConsumptionRecord(
                envelope.eventId(),
                envelope.eventType(),
                EventConsumptionStatus.PROCESSING,
                attempts,
                null,
                null,
                Instant.now(),
                null,
                null
            );
            records.put(record.eventId(), record);
            return record;
        }

        @Override
        public EventConsumptionRecord markProcessed(String eventId) {
            EventConsumptionRecord previous = records.get(eventId);
            EventConsumptionRecord record = new EventConsumptionRecord(
                eventId,
                previous.eventType(),
                EventConsumptionStatus.PROCESSED,
                previous.attempts(),
                null,
                null,
                previous.receivedAt(),
                Instant.now(),
                null
            );
            records.put(eventId, record);
            return record;
        }

        @Override
        public EventConsumptionRecord markFailed(String eventId, boolean retryable, String errorCode, String errorMessage) {
            EventConsumptionRecord previous = records.get(eventId);
            EventConsumptionRecord record = new EventConsumptionRecord(
                eventId,
                previous.eventType(),
                retryable ? EventConsumptionStatus.FAILED_RETRYABLE : EventConsumptionStatus.FAILED_NON_RETRYABLE,
                previous.attempts(),
                errorCode,
                errorMessage,
                previous.receivedAt(),
                null,
                Instant.now()
            );
            records.put(eventId, record);
            return record;
        }

        @Override
        public EventConsumptionRecord recordPoisonMessage(String rawBody, String errorCode, String errorMessage) {
            String eventId = "poison::" + EventHash.sha256(rawBody);
            EventConsumptionRecord record = new EventConsumptionRecord(
                eventId,
                "UNKNOWN",
                EventConsumptionStatus.FAILED_NON_RETRYABLE,
                1,
                errorCode,
                errorMessage,
                Instant.now(),
                null,
                Instant.now()
            );
            records.put(eventId, record);
            return record;
        }
    }
}
