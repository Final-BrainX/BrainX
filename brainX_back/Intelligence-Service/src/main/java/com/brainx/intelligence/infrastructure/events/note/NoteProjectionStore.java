package com.brainx.intelligence.infrastructure.events.note;

import java.util.List;
import java.util.Optional;

public interface NoteProjectionStore {

    Optional<NoteProjection> findByUserIdAndNoteId(String userId, String noteId);

    List<NoteProjection> findByUserIdAndNoteIds(String userId, List<String> noteIds);

    NoteProjection save(NoteProjection projection);
}
