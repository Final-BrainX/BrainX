package com.brainx.intelligence.infrastructure.persistence.jpa.exploration;

import static org.assertj.core.api.Assertions.assertThat;

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
    void deleteSummaryByUserAndNote() {
        explorationJpaAdapter.save(NoteSummary.ai("user-1", "note-1", "AI summary"));
        entityManager.flush();

        explorationJpaAdapter.deleteByUserIdAndNoteId("user-1", "note-1");
        entityManager.flush();
        entityManager.clear();

        assertThat(explorationJpaAdapter.findByUserIdAndNoteId("user-1", "note-1")).isEmpty();
    }
}
