package com.brainx.intelligence.infrastructure.persistence.jpa.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventEnvelope;
import com.brainx.intelligence.infrastructure.events.consumer.EventConsumptionStatus;
import com.fasterxml.jackson.databind.ObjectMapper;

@DataJpaTest
@ActiveProfiles("test")
@Import(EventConsumptionJpaAdapter.class)
class EventConsumptionJpaAdapterTest {

    @Autowired
    private EventConsumptionJpaAdapter adapter;

    @Test
    void markProcessingThenProcessedPreservesAttempts() throws Exception {
        BrainxEventEnvelope envelope = new BrainxEventEnvelope(
            "evt-1",
            "NoteCreated",
            1,
            Instant.parse("2026-06-19T00:00:00Z"),
            "Workspace-Service",
            null,
            "user-1",
            "corr-1",
            null,
            null,
            new ObjectMapper().readTree("{\"noteId\":\"note-1\"}")
        );

        var processing = adapter.markProcessing(envelope, "hash");
        var processed = adapter.markProcessed("evt-1");

        assertThat(processing.status()).isEqualTo(EventConsumptionStatus.PROCESSING);
        assertThat(processed.status()).isEqualTo(EventConsumptionStatus.PROCESSED);
        assertThat(processed.attempts()).isEqualTo(1);
    }

    @Test
    void poisonMessageUsesHashKeyAndIncrementsAttempts() {
        adapter.recordPoisonMessage("{bad", "INVALID_ENVELOPE", "bad json");
        var second = adapter.recordPoisonMessage("{bad", "INVALID_ENVELOPE", "bad json");

        assertThat(second.eventId()).startsWith("poison::");
        assertThat(second.status()).isEqualTo(EventConsumptionStatus.FAILED_NON_RETRYABLE);
        assertThat(second.attempts()).isEqualTo(2);
    }
}
