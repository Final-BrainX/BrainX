package com.brainx.intelligence.infrastructure.events.note;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;

@Component
@ConditionalOnProperty(prefix = "brainx.note-index.retry", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ScheduledNoteReindexWorker {

    private static final Logger LOGGER = LoggerFactory.getLogger(ScheduledNoteReindexWorker.class);
    private static final String EVENT_ID_PREFIX = "note-index-retry:";

    private final NoteProjectionStore noteProjectionStore;
    private final NoteIndexingService noteIndexingService;
    private final NoteIndexRetryProperties properties;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public ScheduledNoteReindexWorker(
        NoteProjectionStore noteProjectionStore,
        NoteIndexingService noteIndexingService,
        NoteIndexRetryProperties properties
    ) {
        this.noteProjectionStore = noteProjectionStore;
        this.noteIndexingService = noteIndexingService;
        this.properties = properties;
    }

    @Scheduled(fixedDelayString = "#{@noteIndexRetryProperties.fixedDelay.toMillis()}")
    void runScheduled() {
        runOnce(Instant.now());
    }

    int runOnce(Instant now) {
        if (!running.compareAndSet(false, true)) {
            LOGGER.debug("Skipping note reindex retry because previous run is still active.");
            return 0;
        }
        try {
            Instant startedAt = now == null ? Instant.now() : now;
            List<NoteProjection> candidates = noteProjectionStore.findIndexRetryCandidates(
                startedAt,
                properties.getBatchSize()
            );
            int attempted = 0;
            for (NoteProjection candidate : candidates) {
                attempted += retryCandidate(candidate, startedAt) ? 1 : 0;
            }
            if (attempted > 0) {
                LOGGER.info("Processed {} note reindex retry candidates.", attempted);
            }
            return attempted;
        } finally {
            running.set(false);
        }
    }

    private boolean retryCandidate(NoteProjection candidate, Instant now) {
        String eventId = retryEventId(candidate, now);
        if (candidate.indexAttemptCount() >= properties.getMaxAttempts()) {
            noteProjectionStore.save(candidate.withIndexRetryExhausted(eventId, now, now.plus(properties.getExhaustedDelay())));
            return false;
        }

        try {
            noteIndexingService.indexFromSnapshot(
                candidate,
                candidate.version(),
                candidate.markdownHash(),
                eventId,
                true,
                false
            );
            return true;
        } catch (EventProcessingException exception) {
            recordFailure(candidate, eventId, now, exception.errorCode(), exception.getMessage(), shouldMarkFailed(exception));
            return true;
        } catch (RuntimeException exception) {
            recordFailure(candidate, eventId, now, "INDEX_RETRY_FAILED", exception.getMessage(), true);
            return true;
        }
    }

    private void recordFailure(
        NoteProjection attemptedProjection,
        String eventId,
        Instant attemptAt,
        String errorCode,
        String errorMessage,
        boolean markFailed
    ) {
        NoteProjection latest = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                attemptedProjection.userId(),
                attemptedProjection.documentGroupId(),
                attemptedProjection.noteId()
            )
            .orElse(attemptedProjection);
        int nextAttemptCount = latest.indexAttemptCount() + 1;
        Duration retryDelay = nextAttemptCount >= properties.getMaxAttempts()
            ? properties.getExhaustedDelay()
            : retryDelay(nextAttemptCount);
        noteProjectionStore.save(latest.withIndexRetryFailure(
            eventId,
            attemptAt,
            attemptAt.plus(retryDelay),
            errorCode,
            errorMessage,
            markFailed || nextAttemptCount >= properties.getMaxAttempts()
        ));
    }

    private static boolean shouldMarkFailed(EventProcessingException exception) {
        return !"SNAPSHOT_UNAVAILABLE".equals(exception.errorCode())
            && !"SNAPSHOT_STALE".equals(exception.errorCode());
    }

    private static Duration retryDelay(int attemptCount) {
        return switch (attemptCount) {
            case 1 -> Duration.ofMinutes(1);
            case 2 -> Duration.ofMinutes(5);
            case 3 -> Duration.ofMinutes(15);
            case 4 -> Duration.ofHours(1);
            default -> Duration.ofHours(6);
        };
    }

    private static String retryEventId(NoteProjection projection, Instant now) {
        return EVENT_ID_PREFIX + projection.noteId() + ":" + now.toEpochMilli();
    }
}
