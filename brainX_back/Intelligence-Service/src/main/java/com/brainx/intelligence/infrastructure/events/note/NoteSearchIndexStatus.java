package com.brainx.intelligence.infrastructure.events.note;

public enum NoteSearchIndexStatus {
    NOT_INDEXED,
    PROVISIONAL,
    STALE,
    INDEXED,
    FAILED,
    REMOVED
}
