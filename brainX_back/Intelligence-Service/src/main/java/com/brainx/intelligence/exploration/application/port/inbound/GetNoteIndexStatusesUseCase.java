package com.brainx.intelligence.exploration.application.port.inbound;

import java.time.Instant;
import java.util.List;

public interface GetNoteIndexStatusesUseCase {

    NoteIndexStatusesResponse getNoteIndexStatuses(NoteIndexStatusesCommand command);

    record NoteIndexStatusesCommand(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        public NoteIndexStatusesCommand {
            noteIds = noteIds == null ? List.of() : List.copyOf(noteIds);
        }
    }

    record NoteIndexStatusesResponse(
        List<NoteIndexStatusView> notes
    ) {
        public NoteIndexStatusesResponse {
            notes = notes == null ? List.of() : List.copyOf(notes);
        }
    }

    record NoteIndexStatusView(
        String noteId,
        String searchIndexStatus,
        boolean availableForAiFeatures,
        Instant indexedAt
    ) {
    }
}
