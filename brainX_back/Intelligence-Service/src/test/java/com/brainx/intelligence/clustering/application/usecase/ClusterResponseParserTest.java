package com.brainx.intelligence.clustering.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.fasterxml.jackson.databind.ObjectMapper;

class ClusterResponseParserTest {

    private final ClusterResponseParser parser = new ClusterResponseParser(new ObjectMapper());

    @Test
    void parsesValidClustersWhenEveryInputNoteIdAppearsExactlyOnce() {
        var clusters = parser.parseClusters(
            "job-1",
            """
                [
                  {"title":"Backend","summary":"summary","noteIds":["note-1","note-2"],"keywords":["Spring","DB"],"confidence":0.8}
                ]
                """,
            notes("note-1", "note-2"),
            2
        );

        assertThat(clusters).hasSize(1);
        assertThat(clusters.getFirst().noteIds()).containsExactly("note-1", "note-2");
    }

    @Test
    void rejectsUnknownNoteIdsInsteadOfFilteringThem() {
        assertThatThrownBy(() -> parser.parseClusters(
            "job-1",
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1","ghost"],"keywords":["Spring"],"confidence":0.8}]
                """,
            notes("note-1", "note-2"),
            2
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("unknown note IDs")
            .hasMessageContaining("missing note IDs");
    }

    @Test
    void rejectsDuplicateNoteIds() {
        assertThatThrownBy(() -> parser.parseClusters(
            "job-1",
            """
                [{"title":"Backend","summary":"summary","noteIds":["note-1","note-1","note-2"],"keywords":["Spring"],"confidence":0.8}]
                """,
            notes("note-1", "note-2"),
            2
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("duplicate note IDs");
    }

    @Test
    void rejectsTooManyClustersInsteadOfTruncatingThem() {
        assertThatThrownBy(() -> parser.parseClusters(
            "job-1",
            """
                [
                  {"title":"A","summary":"summary","noteIds":["note-1"],"keywords":["A"],"confidence":0.8},
                  {"title":"B","summary":"summary","noteIds":["note-2"],"keywords":["B"],"confidence":0.8}
                ]
                """,
            notes("note-1", "note-2"),
            1
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("clusterCount exceeds maxClusters");
    }

    @Test
    void rejectsEmptyClusters() {
        assertThatThrownBy(() -> parser.parseClusters(
            "job-1",
            """
                [
                  {"title":"A","summary":"summary","noteIds":["note-1"],"keywords":["A"],"confidence":0.8},
                  {"title":"Empty","summary":"summary","noteIds":[],"keywords":["empty"],"confidence":0.2}
                ]
                """,
            notes("note-1"),
            2
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("noteIds is empty");
    }

    private static List<KnowledgeAnalysisNote> notes(String... noteIds) {
        return java.util.Arrays.stream(noteIds)
            .map(noteId -> new KnowledgeAnalysisNote(
                "user-1",
                "default",
                noteId,
                noteId,
                List.of(),
                List.of(),
                noteId,
                Instant.parse("2026-06-26T00:00:00Z")
            ))
            .toList();
    }
}
