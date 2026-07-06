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
import com.brainx.intelligence.infrastructure.events.note.NoteSearchIndexStatus;

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
            "default",
            "note-1",
            "Title",
            "folder-1",
            List.of("tag-1", "tag-2"),
            2,
            "hash-2",
            "# Title\n\nmarkdown body",
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(2, "hash-2", Instant.parse("2026-06-19T00:00:01Z")));

        var projection = adapter.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "default", "note-1")
            .orElseThrow();

        assertThat(projection.documentGroupId()).isEqualTo("default");
        assertThat(projection.tags()).containsExactly("tag-1", "tag-2");
        assertThat(projection.markdownHash()).isEqualTo("hash-2");
        assertThat(projection.markdown()).contains("markdown body");
        assertThat(projection.contentPending()).isFalse();
        assertThat(projection.searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.INDEXED);
        assertThat(projection.indexedVersion()).isEqualTo(2);
        assertThat(projection.indexedMarkdownHash()).isEqualTo("hash-2");
        assertThat(projection.indexedAt()).isEqualTo(Instant.parse("2026-06-19T00:00:01Z"));
    }

    @Test
    void findSearchableByUserIdAndDocumentGroupIdReturnsIndexedMarkdownOnly() {
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Indexed",
            null,
            List.of(),
            1,
            "hash-1",
            "indexed markdown",
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-2",
            "Pending",
            null,
            List.of(),
            1,
            "hash-2",
            "pending markdown",
            true,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:00Z")
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-3",
            "No markdown",
            null,
            List.of(),
            1,
            "hash-3",
            false,
            false,
            false,
            false,
            "evt-3",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-3", Instant.parse("2026-06-19T00:00:01Z")));

        var projections = adapter.findSearchableByUserIdAndDocumentGroupId("user-1", "group-1", 10);

        assertThat(projections).extracting(NoteProjection::noteId).containsExactly("note-1");
        assertThat(projections.getFirst().markdown()).isEqualTo("indexed markdown");
    }

    @Test
    void findIndexRetryCandidatesFiltersAndOrdersRetryableProjections() {
        Instant now = Instant.parse("2026-07-03T01:00:00Z");
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "null-retry-old",
            "Null retry old",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-1",
            now.minusSeconds(300)
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "null-retry-new",
            "Null retry new",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-2",
            now.minusSeconds(60)
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "past-retry-early",
            "Past retry early",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-3",
            now.minusSeconds(240)
        ).withIndexRetryFailure("retry-1", now.minusSeconds(240), now.minusSeconds(120), "SNAPSHOT_UNAVAILABLE", "snapshot", false));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "past-retry-late",
            "Past retry late",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-4",
            now.minusSeconds(180)
        ).withIndexRetryFailure("retry-2", now.minusSeconds(180), now.minusSeconds(30), "INDEX_RETRY_FAILED", "failed", true));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "future-retry",
            "Future retry",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-5",
            now.minusSeconds(120)
        ).withIndexRetryFailure("retry-3", now.minusSeconds(120), now.plusSeconds(60), "SNAPSHOT_UNAVAILABLE", "snapshot", false));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "indexed",
            "Indexed",
            null,
            List.of(),
            1,
            "hash-1",
            "indexed markdown",
            false,
            false,
            false,
            false,
            "evt-6",
            now.minusSeconds(90)
        ).indexed(1, "hash-1", now.minusSeconds(80)));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "archived",
            "Archived",
            null,
            List.of(),
            1,
            null,
            true,
            true,
            false,
            false,
            "evt-7",
            now.minusSeconds(70)
        ));

        var candidates = adapter.findIndexRetryCandidates(now, 10);
        var limited = adapter.findIndexRetryCandidates(now, 2);

        assertThat(candidates)
            .extracting(NoteProjection::noteId)
            .containsExactly("null-retry-new", "null-retry-old", "past-retry-early", "past-retry-late");
        assertThat(limited).extracting(NoteProjection::noteId).containsExactly("null-retry-new", "null-retry-old");
        assertThat(candidates.get(3).searchIndexStatus()).isEqualTo(NoteSearchIndexStatus.FAILED);
        assertThat(candidates.get(3).lastIndexErrorCode()).isEqualTo("INDEX_RETRY_FAILED");
    }

    @Test
    void findLinkSuggestionSourceNoteUsesDefaultIndexedSearchableProjection() {
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "note-1",
            "Default note",
            null,
            List.of(),
            1,
            "hash-1",
            "default markdown",
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Other group note",
            null,
            List.of(),
            1,
            "hash-2",
            "other markdown",
            false,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-2", Instant.parse("2026-06-19T00:00:01Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "pending-note",
            "Pending note",
            null,
            List.of(),
            1,
            "hash-3",
            "pending markdown",
            true,
            false,
            false,
            false,
            "evt-3",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        var source = adapter.findLinkSuggestionSourceNote("user-1", "default", "note-1");
        var pending = adapter.findLinkSuggestionSourceNote("user-1", "default", "pending-note");
        var autoLinkSource = adapter.findSearchableNoteSource("user-1", "default", "note-1");
        var pendingAutoLinkSource = adapter.findSearchableNoteSource("user-1", "default", "pending-note");

        assertThat(source).get()
            .extracting("documentGroupId", "noteId", "title")
            .containsExactly("default", "note-1", "Default note");
        assertThat(pending).isEmpty();
        assertThat(autoLinkSource).get()
            .extracting("documentGroupId", "noteId", "title", "markdown")
            .containsExactly("default", "note-1", "Default note", "default markdown");
        assertThat(pendingAutoLinkSource).isEmpty();
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

        var projections = adapter.findByUserIdAndDocumentGroupIdAndNoteIds(
            "user-1",
            "default",
            List.of("note-1", "missing")
        );

        assertThat(projections).extracting(NoteProjection::noteId).containsExactly("note-1");
    }

    @Test
    void findBridgeSourceNotesReturnsActiveDefaultGroupTitlesAndTagsWithoutMarkdownRequirement() {
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "note-1",
            "Java",
            null,
            List.of("backend"),
            1,
            null,
            null,
            true,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z"),
            NoteSearchIndexStatus.NOT_INDEXED,
            null,
            null,
            null
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "note-2",
            "Database",
            null,
            List.of("sql"),
            1,
            null,
            null,
            true,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:00Z"),
            NoteSearchIndexStatus.NOT_INDEXED,
            null,
            null,
            null
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "archived-note",
            "Archived",
            null,
            List.of("old"),
            1,
            null,
            null,
            true,
            true,
            false,
            false,
            "evt-3",
            Instant.parse("2026-06-19T00:00:00Z"),
            NoteSearchIndexStatus.REMOVED,
            null,
            null,
            null
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Other group",
            null,
            List.of("ignored"),
            1,
            null,
            null,
            true,
            false,
            false,
            false,
            "evt-4",
            Instant.parse("2026-06-19T00:00:00Z"),
            NoteSearchIndexStatus.NOT_INDEXED,
            null,
            null,
            null
        ));

        var sources = adapter.findBridgeSourceNotes(
            "user-1",
            "default",
            List.of("note-2", "archived-note", "note-1")
        );

        assertThat(sources).extracting("noteId").containsExactly("note-2", "note-1");
        assertThat(sources.getFirst().title()).isEqualTo("Database");
        assertThat(sources.getFirst().tags()).containsExactly("sql");
    }

    @Test
    void sameNoteIdCanBeStoredSeparatelyByDocumentGroupId() {
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Group 1 title",
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
        adapter.save(new NoteProjection(
            "user-1",
            "group-2",
            "note-1",
            "Group 2 title",
            null,
            List.of(),
            1,
            null,
            true,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        assertThat(adapter.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1"))
            .get()
            .extracting(NoteProjection::title)
            .isEqualTo("Group 1 title");
        assertThat(adapter.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-2", "note-1"))
            .get()
            .extracting(NoteProjection::title)
            .isEqualTo("Group 2 title");
    }

    @Test
    void findAnalysisNotesReturnsIndexedMarkdownNoteCardsWithHeadingsAndExcerpt() {
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "note-1",
            "Architecture",
            null,
            List.of("backend"),
            1,
            "hash-1",
            """
                # System Overview

                BrainX intelligence service indexes notes.

                ## Search

                ```java
                ignored code fence
                ```

                RAG queries are isolated by document group.
                """,
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "group-1",
            "pending-note",
            "Pending",
            null,
            List.of(),
            1,
            "hash-2",
            "pending markdown",
            true,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:00Z")
        ));

        var notes = adapter.findAnalysisNotes("user-1", "group-1", 10);
        var byIds = adapter.findAnalysisNotesByIds("user-1", "group-1", List.of("note-1", "pending-note"));

        assertThat(notes).hasSize(1);
        assertThat(notes.getFirst().noteId()).isEqualTo("note-1");
        assertThat(notes.getFirst().headings()).containsExactly("System Overview", "Search");
        assertThat(notes.getFirst().excerpt()).contains("BrainX intelligence service indexes notes");
        assertThat(notes.getFirst().excerpt()).doesNotContain("ignored code fence");
        assertThat(byIds).extracting("noteId").containsExactly("note-1");
    }

    @Test
    void findOrganizationSourceNotesReturnsIndexedMarkdownCardsByAllOrFolderScope() {
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "note-1",
            "Architecture",
            "folder-a",
            List.of("backend"),
            1,
            "hash-1",
            """
                # Architecture

                BrainX folder organization note.
                """,
            false,
            false,
            false,
            false,
            "evt-1",
            Instant.parse("2026-06-19T00:00:00Z")
        ).indexed(1, "hash-1", Instant.parse("2026-06-19T00:00:01Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "note-2",
            "Database",
            "folder-b",
            List.of("sql"),
            1,
            "hash-2",
            "# Database\n\nPostgreSQL note.",
            false,
            false,
            false,
            false,
            "evt-2",
            Instant.parse("2026-06-19T00:00:02Z")
        ).indexed(1, "hash-2", Instant.parse("2026-06-19T00:00:03Z")));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "pending-note",
            "Pending",
            "folder-a",
            List.of(),
            1,
            "hash-3",
            "pending markdown",
            true,
            false,
            false,
            false,
            "evt-3",
            Instant.parse("2026-06-19T00:00:04Z")
        ));
        adapter.save(new NoteProjection(
            "user-1",
            "default",
            "archived-note",
            "Archived",
            "folder-a",
            List.of(),
            1,
            "hash-4",
            "archived markdown",
            false,
            true,
            false,
            false,
            "evt-4",
            Instant.parse("2026-06-19T00:00:05Z")
        ));

        var allNotes = adapter.findOrganizationSourceNotes("user-1", "default", 10);
        var folderNotes = adapter.findOrganizationSourceNotesByFolder("user-1", "default", "folder-a", 10);

        assertThat(allNotes).extracting("noteId").containsExactly("note-2", "note-1");
        assertThat(folderNotes).extracting("noteId").containsExactly("note-1");
        assertThat(folderNotes.getFirst().folderId()).isEqualTo("folder-a");
        assertThat(folderNotes.getFirst().headings()).containsExactly("Architecture");
        assertThat(folderNotes.getFirst().excerpt()).contains("BrainX folder organization note");
    }
}
