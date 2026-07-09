package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SummarySource;

@DataJpaTest
@ActiveProfiles("test")
@Import(ExplorationJpaAdapter.class)
class ExplorationJpaAdapterTest {

    @Autowired
    private ExplorationJpaAdapter explorationJpaAdapter;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void saveAndFindSummaryPreservesSource() {
        explorationJpaAdapter.save(NoteSummary.ai("user-1", "note-1", "AI summary"));
        entityManager.flush();
        entityManager.clear();

        var summary = explorationJpaAdapter.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();

        assertThat(summary.summary()).isEqualTo("AI summary");
        assertThat(summary.source()).isEqualTo(SummarySource.AI);
    }

    @Test
    void findSummaryByUserAndNoteHandlesLegacyAndDocumentGroupRows() {
        explorationJpaAdapter.save(NoteSummary.ai("user-1", "note-1", "Legacy AI summary"));
        explorationJpaAdapter.save(NoteSummary.ai(
            "user-1",
            "group-1",
            "note-1",
            "Fresh AI summary",
            "hash-1",
            "gpt-5.4-nano",
            Instant.parse("2026-07-09T03:00:00Z")
        ));
        entityManager.flush();
        entityManager.clear();

        var summary = explorationJpaAdapter.findByUserIdAndNoteId("user-1", "note-1").orElseThrow();

        assertThat(summary.summary()).isEqualTo("Fresh AI summary");
        assertThat(summary.documentGroupId()).isEqualTo("group-1");
        assertThat(summary.generatedAt()).isEqualTo(Instant.parse("2026-07-09T03:00:00Z"));
    }

    @Test
    void deleteSummaryByUserAndNote() {
        explorationJpaAdapter.save(NoteSummary.ai("user-1", "note-1", "AI summary"));
        entityManager.flush();

        explorationJpaAdapter.deleteByUserIdAndNoteId("user-1", "note-1");
        entityManager.flush();
        entityManager.clear();

        assertThat(explorationJpaAdapter.findByUserIdAndNoteId("user-1", "note-1")).isEmpty();
    }

    @Test
    void deleteSummaryByDocumentGroupKeepsOtherGroupsForSameNote() {
        explorationJpaAdapter.save(NoteSummary.ai(
            "user-1",
            "group-1",
            "note-1",
            "Group one summary",
            "hash-1",
            "gpt-5.4-nano",
            Instant.parse("2026-07-09T03:00:00Z")
        ));
        explorationJpaAdapter.save(NoteSummary.ai(
            "user-1",
            "group-2",
            "note-1",
            "Group two summary",
            "hash-2",
            "gpt-5.4-nano",
            Instant.parse("2026-07-09T04:00:00Z")
        ));
        entityManager.flush();

        explorationJpaAdapter.deleteByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1");
        entityManager.flush();
        entityManager.clear();

        assertThat(explorationJpaAdapter.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1")).isEmpty();
        assertThat(explorationJpaAdapter.findByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-2", "note-1"))
            .hasValueSatisfying(summary -> assertThat(summary.summary()).isEqualTo("Group two summary"));
    }
}
