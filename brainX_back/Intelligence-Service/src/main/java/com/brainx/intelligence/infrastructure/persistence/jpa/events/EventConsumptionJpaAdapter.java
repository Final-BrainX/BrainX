package com.brainx.intelligence.infrastructure.persistence.jpa.events;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventEnvelope;
import com.brainx.intelligence.infrastructure.events.consumer.EventConsumptionRecord;
import com.brainx.intelligence.infrastructure.events.consumer.EventConsumptionStore;

@Repository
public class EventConsumptionJpaAdapter implements EventConsumptionStore {

    private final EventConsumptionJpaRepository repository;
    private final Clock clock;

    @Autowired
    public EventConsumptionJpaAdapter(EventConsumptionJpaRepository repository) {
        this(repository, Clock.systemUTC());
    }

    EventConsumptionJpaAdapter(EventConsumptionJpaRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EventConsumptionRecord> findByEventId(String eventId) {
        return repository.findById(eventId).map(EventConsumptionJpaEntity::toRecord);
    }

    @Override
    @Transactional
    public EventConsumptionRecord markProcessing(BrainxEventEnvelope envelope, String payloadHash) {
        Instant now = clock.instant();
        EventConsumptionJpaEntity entity = repository.findById(envelope.eventId())
            .orElseGet(() -> EventConsumptionJpaEntity.processing(envelope, payloadHash, now));
        if (repository.existsById(envelope.eventId())) {
            entity.markProcessing(envelope, payloadHash, now);
        }
        return repository.save(entity).toRecord();
    }

    @Override
    @Transactional
    public EventConsumptionRecord markProcessed(String eventId) {
        EventConsumptionJpaEntity entity = repository.findById(eventId)
            .orElseThrow(() -> new IllegalStateException("Event consumption record not found: " + eventId));
        entity.markProcessed(clock.instant());
        return repository.save(entity).toRecord();
    }

    @Override
    @Transactional
    public EventConsumptionRecord markFailed(String eventId, boolean retryable, String errorCode, String errorMessage) {
        EventConsumptionJpaEntity entity = repository.findById(eventId)
            .orElseThrow(() -> new IllegalStateException("Event consumption record not found: " + eventId));
        entity.markFailed(retryable, errorCode, errorMessage, clock.instant());
        return repository.save(entity).toRecord();
    }

    @Override
    @Transactional
    public EventConsumptionRecord recordPoisonMessage(String rawBody, String errorCode, String errorMessage) {
        String payloadHash = com.brainx.intelligence.infrastructure.events.consumer.EventHash.sha256(rawBody);
        String eventId = "poison::" + payloadHash;
        Instant now = clock.instant();
        EventConsumptionJpaEntity entity = repository.findById(eventId)
            .orElseGet(() -> EventConsumptionJpaEntity.poison(eventId, payloadHash, errorCode, errorMessage, now));
        if (repository.existsById(eventId)) {
            entity.incrementPoison(errorCode, errorMessage, now);
        }
        return repository.save(entity).toRecord();
    }
}
