package com.brainx.intelligence.clustering.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

class ExistingClusterFitResponseParserTest {

    private final ExistingClusterFitResponseParser parser = new ExistingClusterFitResponseParser(new ObjectMapper());

    @Test
    void parsesKnownClusterAndNullAssignments() {
        var result = parser.parse(
            """
                {"assignments":[
                  {"noteId":"note-1","clusterId":"cluster-1","confidence":0.75},
                  {"noteId":"note-2","clusterId":null,"confidence":0.2}
                ]}
                """,
            List.of("note-1", "note-2"),
            Set.of("cluster-1")
        );

        assertThat(result).hasSize(2);
        assertThat(result.getFirst().clusterId()).isEqualTo("cluster-1");
        assertThat(result.get(1).clusterId()).isNull();
    }

    @Test
    void rejectsMissingDuplicateAndUnknownAssignments() {
        assertThatThrownBy(() -> parser.parse(
            """
                [
                  {"noteId":"note-1","clusterId":"ghost","confidence":1.2},
                  {"noteId":"note-1","clusterId":null,"confidence":0.2}
                ]
                """,
            List.of("note-1", "note-2"),
            Set.of("cluster-1")
        )).isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("unknown clusterId")
            .hasMessageContaining("missing note IDs")
            .hasMessageContaining("duplicate note IDs")
            .hasMessageContaining("outside 0..1");
    }
}
