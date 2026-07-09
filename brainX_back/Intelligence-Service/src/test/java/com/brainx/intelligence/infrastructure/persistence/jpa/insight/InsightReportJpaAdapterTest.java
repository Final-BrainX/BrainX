package com.brainx.intelligence.infrastructure.persistence.jpa.insight;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportStatus;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.fasterxml.jackson.databind.ObjectMapper;

@DataJpaTest
@ActiveProfiles("test")
@Import({InsightReportJpaAdapter.class, InsightReportJpaAdapterTest.ObjectMapperConfig.class})
class InsightReportJpaAdapterTest {

    @Autowired
    private InsightReportJpaAdapter adapter;

    @Test
    void saveAndFindPreservesJsonFieldsAndIdempotencyKey() {
        InsightReport saved = adapter.save(new InsightReport(
            "report-1",
            "user-1",
            "group-1",
            InsightReportStatus.COMPLETED,
            Map.of("documentGroupId", "group-1", "maxNotes", 10),
            true,
            "summary",
            List.of("gap"),
            List.of(new InsightRecommendation("CONNECT", "title", "reason", List.of("note-1"), "HIGH")),
            "gpt-test",
            "idem-1",
            null,
            Instant.parse("2026-06-26T00:00:00Z"),
            Instant.parse("2026-06-26T00:00:01Z")
        ));

        assertThat(saved.reportId()).isEqualTo("report-1");

        var found = adapter.findByUserIdAndReportId("user-1", "report-1").orElseThrow();
        var byIdempotency = adapter.findByUserIdAndIdempotencyKey("user-1", "idem-1").orElseThrow();

        assertThat(found.documentGroupId()).isEqualTo("group-1");
        assertThat(found.includeLearningRecommendations()).isTrue();
        assertThat(found.scope()).containsEntry("documentGroupId", "group-1");
        assertThat(found.knowledgeGaps()).containsExactly("gap");
        assertThat(found.recommendations()).hasSize(1);
        assertThat(found.recommendations().getFirst().noteIds()).containsExactly("note-1");
        assertThat(byIdempotency.reportId()).isEqualTo("report-1");
    }

    @Test
    void findRecentByUserIdAndDocumentGroupIdReturnsNewestFirstWithinGroup() {
        adapter.save(report("report-1", "user-1", "group-1", Instant.parse("2026-06-26T00:00:00Z")));
        adapter.save(report("report-3", "user-1", "group-2", Instant.parse("2026-06-28T00:00:00Z")));
        adapter.save(report("report-2", "user-1", "group-1", Instant.parse("2026-06-27T00:00:00Z")));
        adapter.save(report("report-4", "user-2", "group-1", Instant.parse("2026-06-29T00:00:00Z")));

        var recent = adapter.findRecentByUserIdAndDocumentGroupId("user-1", "group-1", 10);

        assertThat(recent)
            .extracting(InsightReport::reportId)
            .containsExactly("report-2", "report-1");
    }

    @Test
    void duplicateUserIdempotencyKeyIsRejectedBeforeReportExecution() {
        adapter.save(reportWithIdempotency("report-1", "idem-duplicate"));

        assertThatThrownBy(() -> adapter.save(reportWithIdempotency("report-2", "idem-duplicate")))
            .isInstanceOf(InsightConflictException.class)
            .hasMessageContaining("idempotency key");
    }

    private static InsightReport reportWithIdempotency(String reportId, String idempotencyKey) {
        return new InsightReport(
            reportId,
            "user-1",
            "group-1",
            InsightReportStatus.RUNNING,
            Map.of("documentGroupId", "group-1"),
            false,
            null,
            List.of(),
            List.of(),
            "gpt-test",
            idempotencyKey,
            null,
            Instant.parse("2026-07-10T00:00:00Z"),
            null
        );
    }

    private static InsightReport report(String reportId, String userId, String documentGroupId, Instant createdAt) {
        return new InsightReport(
            reportId,
            userId,
            documentGroupId,
            InsightReportStatus.COMPLETED,
            Map.of("documentGroupId", documentGroupId, "maxNotes", 10),
            false,
            "summary",
            List.of(),
            List.of(),
            "gpt-test",
            null,
            null,
            createdAt,
            createdAt.plusSeconds(1)
        );
    }

    static class ObjectMapperConfig {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper().findAndRegisterModules();
        }
    }
}
