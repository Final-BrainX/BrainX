package com.brainx.intelligence.insight.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.insight.application.port.inbound.RequestInsightReportUseCase.InsightReportCommand;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportCompletedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightEventPort.InsightReportRequestedEvent;
import com.brainx.intelligence.insight.application.port.outbound.InsightReportStore;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightReport;
import com.brainx.intelligence.insight.domain.InsightReportStatus;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementDecision;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class InsightServiceTest {

    private final FakeInsightReportStore store = new FakeInsightReportStore();
    private final FakeNoteSource noteSource = new FakeNoteSource();
    private final FakeEntitlementPort entitlementPort = new FakeEntitlementPort();
    private final FakeAiModelSettingsPort settingsPort = new FakeAiModelSettingsPort();
    private final FakeAiChatPort chatPort = new FakeAiChatPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final FakeInsightEventPort eventPort = new FakeInsightEventPort();
    private final InsightProperties properties = new InsightProperties();
    private final FakeStyleProfilePort styleProfilePort = new FakeStyleProfilePort();
    private final StylePromptCompiler stylePromptCompiler = new StylePromptCompiler(styleProfilePort);
    private final InsightService service = new InsightService(
        store,
        noteSource,
        entitlementPort,
        settingsPort,
        chatPort,
        new AiUsageRecorder(tokenUsagePort, new AiTokenUsageCostEstimator(new EmptyAiModelCatalogPort())),
        eventPort,
        properties,
        new ObjectMapper(),
        stylePromptCompiler,
        Clock.fixed(Instant.parse("2026-06-26T00:00:00Z"), ZoneOffset.UTC)
    );

    @Test
    void requestInsightReportFiltersLearningRecommendationsWhenDisabled() {
        settingsPort.settings = Optional.of(new AiModelSettings("user-1", "gpt-user", Map.of()));
        styleProfilePort.profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("directness", "high")),
            new WritingStyle(Map.of("formality", "business", "informationDensity", "dense")),
            null
        );
        noteSource.notes = List.of(
            note("note-1", "Spring", List.of("backend"), List.of("Security"), "Spring Security basics"),
            note("note-2", "OAuth", List.of("auth"), List.of("Token"), "OAuth token flow")
        );
        chatPort.response = new AiChatResponse(
            """
                {
                  "summary": "인증 지식이 백엔드에 집중되어 있다.",
                  "knowledgeGaps": ["운영 보안 점검 노트가 부족하다."],
                  "recommendations": [
                    {"type":"CONNECT","title":"Spring Security와 OAuth 연결","reason":"두 노트가 인증 흐름으로 이어진다.","noteIds":["note-1","note-2"],"priority":"HIGH"},
                    {"type":"LEARNING_RECOMMENDATION","title":"JWT 학습","reason":"추가 학습이 필요하다.","noteIds":["note-2"],"priority":"LOW"}
                  ]
                }
                """,
            new AiTokenUsage(90, 30, 120, 20, 4)
        );

        InsightReport report = service.requestInsightReport(new InsightReportCommand(
            "user-1",
            Map.of("documentGroupId", "group-1", "maxNotes", 20),
            false,
            "idem-1"
        ));

        assertThat(report.status()).isEqualTo(InsightReportStatus.COMPLETED);
        assertThat(report.documentGroupId()).isEqualTo("group-1");
        assertThat(report.summary()).contains("인증 지식");
        assertThat(report.knowledgeGaps()).containsExactly("운영 보안 점검 노트가 부족하다.");
        assertThat(report.recommendations()).hasSize(1);
        assertThat(report.recommendations().getFirst().type()).isEqualTo("CONNECT");
        assertThat(chatPort.lastRequest.modelId()).isEqualTo("gpt-user");
        assertThat(chatPort.lastRequest.messages().getFirst().content())
            .contains("User writing style profile")
            .contains("- formality: business")
            .doesNotContain("User conversation tone profile");
        assertThat(entitlementPort.lastRequest.capability()).isEqualTo("INSIGHT_REPORT");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("insight-report-chat");
        assertThat(tokenUsagePort.records.getFirst().cachedInputTokens()).isEqualTo(20);
        assertThat(eventPort.requestedEvents).hasSize(1);
        assertThat(eventPort.completedEvents).hasSize(1);
    }

    @Test
    void noSearchableNotesIsConflictBeforeEntitlement() {
        assertThatThrownBy(() -> service.requestInsightReport(new InsightReportCommand("user-1", Map.of(), false, null)))
            .isInstanceOf(InsightConflictException.class);

        assertThat(entitlementPort.lastRequest).isNull();
        assertThat(chatPort.generateCalls).isZero();
    }

    @Test
    void idempotencyKeyReturnsExistingReport() {
        noteSource.notes = List.of(note("note-1", "Spring", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse(
            """
                {"summary":"요약","knowledgeGaps":[],"recommendations":[]}
                """,
            null
        );

        InsightReport first = service.requestInsightReport(new InsightReportCommand("user-1", Map.of(), false, "same-key"));
        InsightReport second = service.requestInsightReport(new InsightReportCommand("user-1", Map.of(), false, "same-key"));

        assertThat(second.reportId()).isEqualTo(first.reportId());
        assertThat(chatPort.generateCalls).isEqualTo(1);
        assertThat(eventPort.requestedEvents).hasSize(1);
    }

    @Test
    void entitlementDeniedStopsBeforeModelCall() {
        noteSource.notes = List.of(note("note-1", "Spring", List.of(), List.of(), "Spring"));
        entitlementPort.allowed = false;
        entitlementPort.reasonCode = "PLAN_REQUIRED";

        assertThatThrownBy(() -> service.requestInsightReport(new InsightReportCommand("user-1", Map.of(), true, null)))
            .isInstanceOf(InsightForbiddenException.class)
            .hasMessageContaining("PLAN_REQUIRED");

        assertThat(store.reportsById).isEmpty();
        assertThat(chatPort.generateCalls).isZero();
        assertThat(eventPort.requestedEvents).isEmpty();
    }

    @Test
    void invalidProviderJsonIsStoredAsFailedReport() {
        noteSource.notes = List.of(note("note-1", "Spring", List.of(), List.of(), "Spring"));
        chatPort.response = new AiChatResponse("not json", null);

        InsightReport report = service.requestInsightReport(new InsightReportCommand("user-1", Map.of(), false, null));

        assertThat(report.status()).isEqualTo(InsightReportStatus.FAILED);
        assertThat(report.failureMessage()).contains("not valid JSON");
        assertThat(store.reportsById.get(report.reportId()).status()).isEqualTo(InsightReportStatus.FAILED);
        assertThat(eventPort.completedEvents).isEmpty();
    }

    private static KnowledgeAnalysisNote note(
        String noteId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt
    ) {
        return new KnowledgeAnalysisNote(
            "user-1",
            "default",
            noteId,
            title,
            tags,
            headings,
            excerpt,
            Instant.parse("2026-06-26T00:00:00Z")
        );
    }

    private static class FakeInsightReportStore implements InsightReportStore {
        private final Map<String, InsightReport> reportsById = new LinkedHashMap<>();
        private final Map<String, InsightReport> reportsByIdempotency = new LinkedHashMap<>();

        @Override
        public InsightReport save(InsightReport report) {
            reportsById.put(report.reportId(), report);
            if (report.idempotencyKey() != null) {
                reportsByIdempotency.put(report.userId() + "::" + report.idempotencyKey(), report);
            }
            return report;
        }

        @Override
        public Optional<InsightReport> findByUserIdAndReportId(String userId, String reportId) {
            return Optional.ofNullable(reportsById.get(reportId))
                .filter(report -> report.userId().equals(userId));
        }

        @Override
        public Optional<InsightReport> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey) {
            return Optional.ofNullable(reportsByIdempotency.get(userId + "::" + idempotencyKey));
        }
    }

    private static class FakeNoteSource implements KnowledgeAnalysisNoteSourcePort {
        private List<KnowledgeAnalysisNote> notes = List.of();

        @Override
        public List<KnowledgeAnalysisNote> findAnalysisNotes(String userId, String documentGroupId, int limit) {
            return notes.stream()
                .map(note -> new KnowledgeAnalysisNote(
                    userId,
                    documentGroupId,
                    note.noteId(),
                    note.title(),
                    note.tags(),
                    note.headings(),
                    note.excerpt(),
                    note.updatedAt()
                ))
                .limit(limit)
                .toList();
        }

        @Override
        public List<KnowledgeAnalysisNote> findAnalysisNotesByIds(String userId, String documentGroupId, List<String> noteIds) {
            return noteIds.stream()
                .flatMap(noteId -> notes.stream().filter(note -> note.noteId().equals(noteId)))
                .toList();
        }
    }

    private static class FakeEntitlementPort implements EntitlementPort {
        private boolean allowed = true;
        private String reasonCode = "OK";
        private EntitlementRequest lastRequest;

        @Override
        public EntitlementDecision checkEntitlement(EntitlementRequest request) {
            lastRequest = request;
            return new EntitlementDecision(allowed, reasonCode, 1000);
        }
    }

    private static class FakeAiModelSettingsPort implements AiModelSettingsPort {
        private Optional<AiModelSettings> settings = Optional.empty();

        @Override
        public AiModelSettings save(AiModelSettings settings) {
            this.settings = Optional.of(settings);
            return settings;
        }

        @Override
        public Optional<AiModelSettings> findSettingsByUserId(String userId) {
            return settings;
        }
    }

    private static class FakeAiChatPort implements AiChatPort {
        private AiChatResponse response = new AiChatResponse("{}", null);
        private AiChatRequest lastRequest;
        private int generateCalls;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            lastRequest = request;
            generateCalls++;
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static class FakeTokenUsagePort implements TokenUsagePort {
        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static class FakeInsightEventPort implements InsightEventPort {
        private final List<InsightReportRequestedEvent> requestedEvents = new ArrayList<>();
        private final List<InsightReportCompletedEvent> completedEvents = new ArrayList<>();

        @Override
        public void insightReportRequested(InsightReportRequestedEvent event) {
            requestedEvents.add(event);
        }

        @Override
        public void insightReportCompleted(InsightReportCompletedEvent event) {
            completedEvents.add(event);
        }
    }

    private static class FakeStyleProfilePort implements StyleProfilePort {

        private StyleProfile profile;

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            profile = styleProfile;
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return Optional.ofNullable(profile)
                .filter(item -> item.userId().equals(userId));
        }
    }

    private static class EmptyAiModelCatalogPort implements AiModelCatalogPort {
        @Override
        public List<AiModel> findAll() {
            return List.of();
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return false;
        }
    }
}
