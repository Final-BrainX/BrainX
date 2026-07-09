package com.brainx.intelligence.infrastructure.events.note;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class NoteProjectionTest {

    @Test
    void explicitNullFolderMovesProjectionToWorkspaceRoot() {
        NoteProjection projection = new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Title",
            "folder-1",
            List.of(),
            1,
            "hash-1",
            "markdown",
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        );

        NoteProjection moved = projection.withMetadata(
            projection.title(),
            null,
            projection.tags(),
            projection.archived(),
            2,
            "evt-2",
            Instant.parse("2026-06-19T00:00:01Z")
        );

        assertThat(moved.folderId()).isNull();
    }
}
