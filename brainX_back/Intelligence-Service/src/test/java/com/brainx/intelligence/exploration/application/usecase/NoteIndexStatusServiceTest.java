package com.brainx.intelligence.exploration.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase.NoteIndexStatusesCommand;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort.NoteIndexStatusProjection;

class NoteIndexStatusServiceTest {

    private final FakeNoteProjectionStore store = new FakeNoteProjectionStore();
    private final NoteIndexStatusService service = new NoteIndexStatusService(store);

    @Test
    void returnsStatusesInRequestedOrderAndDefaultsMissingToNotIndexed() {
        store.projections.add(projection("note-indexed", "INDEXED", true));
        store.projections.add(projection("note-failed", "FAILED", false));

        var result = service.getNoteIndexStatuses(new NoteIndexStatusesCommand(
            "user-1",
            "group-1",
            List.of("note-missing", "note-indexed", "note-failed", "note-indexed")
        ));

        assertThat(result.notes()).extracting("noteId")
            .containsExactly("note-missing", "note-indexed", "note-failed", "note-indexed");
        assertThat(result.notes()).extracting("searchIndexStatus")
            .containsExactly("NOT_INDEXED", "INDEXED", "FAILED", "INDEXED");
        assertThat(result.notes()).extracting("availableForAiFeatures")
            .containsExactly(false, true, false, true);
    }

    @Test
    void sourceReadyProjectionIsAvailableForAiFeaturesRegardlessOfIndexStatus() {
        store.projections.add(projection("indexed", "INDEXED", true));
        store.projections.add(projection("pending", "INDEXED", false));
        store.projections.add(projection("no-markdown", "INDEXED", false));
        store.projections.add(projection("stale", "STALE", true));
        store.projections.add(projection("failed", "FAILED", true));
        store.projections.add(projection("not-indexed", "NOT_INDEXED", true));
        store.projections.add(projection("removed", "REMOVED", false));

        var result = service.getNoteIndexStatuses(new NoteIndexStatusesCommand(
            "user-1",
            "group-1",
            List.of("indexed", "pending", "no-markdown", "stale", "failed", "not-indexed", "removed")
        ));

        assertThat(result.notes()).extracting("searchIndexStatus")
            .containsExactly("INDEXED", "INDEXED", "INDEXED", "STALE", "FAILED", "NOT_INDEXED", "REMOVED");
        assertThat(result.notes()).extracting("availableForAiFeatures")
            .containsExactly(true, false, false, true, true, true, false);
    }

    @Test
    void doesNotExposeOtherUserProjection() {
        store.projections.add(projection("note-1", "other-user", "group-1", "INDEXED", true));

        var result = service.getNoteIndexStatuses(new NoteIndexStatusesCommand(
            "user-1",
            "group-1",
            List.of("note-1")
        ));

        assertThat(result.notes().getFirst().searchIndexStatus()).isEqualTo("NOT_INDEXED");
        assertThat(result.notes().getFirst().availableForAiFeatures()).isFalse();
    }

    private static FakeNoteIndexStatusProjection projection(
        String noteId,
        String status,
        boolean availableForAiFeatures
    ) {
        return projection(noteId, "user-1", "group-1", status, availableForAiFeatures);
    }

    private static FakeNoteIndexStatusProjection projection(
        String noteId,
        String userId,
        String documentGroupId,
        String status,
        boolean availableForAiFeatures
    ) {
        return new FakeNoteIndexStatusProjection(
            userId,
            documentGroupId,
            noteId,
            status,
            availableForAiFeatures,
            "INDEXED".equals(status) ? Instant.parse("2026-07-03T00:00:01Z") : null
        );
    }

    private record FakeNoteIndexStatusProjection(
        String userId,
        String documentGroupId,
        String noteId,
        String searchIndexStatus,
        boolean availableForAiFeatures,
        Instant indexedAt
    ) {
    }

    private static final class FakeNoteProjectionStore implements NoteIndexStatusPort {

        private final List<FakeNoteIndexStatusProjection> projections = new ArrayList<>();

        @Override
        public List<NoteIndexStatusProjection> findNoteIndexStatuses(
            String userId,
            String documentGroupId,
            List<String> noteIds
        ) {
            return projections.stream()
                .filter(projection -> projection.userId().equals(userId))
                .filter(projection -> projection.documentGroupId().equals(documentGroupId))
                .filter(projection -> noteIds.contains(projection.noteId()))
                .map(projection -> new NoteIndexStatusProjection(
                    projection.noteId(),
                    projection.searchIndexStatus(),
                    projection.availableForAiFeatures(),
                    projection.indexedAt()
                ))
                .toList();
        }
    }
}
