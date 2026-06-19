package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.infrastructure.events.note.NoteProjection;

@DataJpaTest
@ActiveProfiles("test")
@Import(NoteProjectionJpaAdapter.class)
class NoteProjectionJpaAdapterTest {

    @Autowired
    private NoteProjectionJpaAdapter adapter;

    @Test
    void saveAndFindProjectionPreservesTagsAndState() {
        adapter.save(new NoteProjection(
            "user-1",
            "note-1",
            "Title",
            "folder-1",
            List.of("tag-1", "tag-2"),
            2,
            "hash-2",
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        var projection = adapter.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();

        assertThat(projection.tags()).containsExactly("tag-1", "tag-2");
        assertThat(projection.markdownHash()).isEqualTo("hash-2");
        assertThat(projection.contentPending()).isFalse();
    }

    @Test
    void findByUserIdAndNoteIdsReturnsExistingProjectionsOnly() {
        adapter.save(new NoteProjection(
            "user-1",
            "note-1",
            "Title",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        var projections = adapter.findByUserIdAndNoteIds("user-1", List.of("note-1", "missing"));

        assertThat(projections).extracting(NoteProjection::noteId).containsExactly("note-1");
    }
}
