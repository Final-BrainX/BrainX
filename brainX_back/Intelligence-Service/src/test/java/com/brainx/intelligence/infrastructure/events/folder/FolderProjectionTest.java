package com.brainx.intelligence.infrastructure.events.folder;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class FolderProjectionTest {

    @Test
    void explicitNullParentMovesProjectionToRoot() {
        FolderProjection projection = FolderProjection.created(
            "folder-1",
            "user-1",
            "Projects",
            "folder-parent",
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        );

        FolderProjection moved = projection.withChanges(
            projection.name(),
            null,
            projection.order(),
            "evt-2",
            Instant.parse("2026-06-19T00:00:01Z")
        );

        assertThat(moved.parentFolderId()).isNull();
    }
}
