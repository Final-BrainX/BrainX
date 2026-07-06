package com.brainx.intelligence.autolink.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSourceCommand;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort.AutoLinkNoteSource;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkUsageCapturePort;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

class NoteAutoLinkServiceTest {

    @Test
    void limitExceededDoesNotCallVectorOrLlm() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        for (int index = 0; index < 3; index++) {
            projectionStore.notes.add(note("note-" + index, "Note " + index, "keyword " + index));
        }
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.COMPARE,
            2,
            "gpt-5.4-mini"
        ));

        assertThat(result.status()).isEqualTo("LIMIT_EXCEEDED");
        assertThat(result.limitExceeded()).isTrue();
        assertThat(chunkRetrieval.queries).isEmpty();
        assertThat(aiChatPort.requests).isEmpty();
    }

    @Test
    void llmOnlyDoesNotCallVectorAndFiltersMissingAnchor() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Source", "This note mentions Knowledge Graphs."));
        projectionStore.notes.add(note("target", "Target", "Knowledge Graphs are useful."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [
              {"anchorText":"Knowledge Graphs","targetNoteId":"target","reason":"same topic","confidence":0.8},
              {"anchorText":"Missing Anchor","targetNoteId":"target","reason":"bad","confidence":0.8}
            ]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.strategy()).isEqualTo(NoteAutoLinkStrategy.LLM_ONLY);
        assertThat(chunkRetrieval.queries).isEmpty();
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.suggestions().getFirst().anchor().matchedText()).isEqualTo("Knowledge Graphs");
        assertThat(aiChatPort.requests.getFirst().messages().getFirst().content())
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence")
            .contains("Keep the directness level: high")
            .doesNotContain("every final generated or edited user-facing text segment");
        assertThat(strategy.filteredInvalidAnchorCount()).isEqualTo(1);
        assertThat(strategy.filteredQualityCount()).isZero();
        assertThat(strategy.usageRecords()).hasSize(2);
        assertThat(strategy.usageSummary().inputTokens()).isEqualTo(20);
    }

    @Test
    void sourceOnlyLlmOnlyAnalyzesRequestedSourceOnce() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Source", "This note mentions Knowledge Graphs."));
        projectionStore.notes.add(note("target", "Target", "Knowledge Graphs are useful."));
        projectionStore.notes.add(note("other", "Other", "Another candidate note."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Knowledge Graphs","targetNoteId":"target","reason":"same topic","confidence":0.8}]
            """);

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyzeSourceLinks(new AutoLinkSourceCommand(
            "user-1",
            "group-1",
            "source",
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(result.analyzedNoteCount()).isEqualTo(1);
        assertThat(strategy.analyzedNoteCount()).isEqualTo(1);
        assertThat(strategy.llmCallCount()).isEqualTo(1);
        assertThat(strategy.candidatePairCount()).isEqualTo(2);
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.suggestions().getFirst().sourceNoteId()).isEqualTo("source");
        assertThat(strategy.suggestions().getFirst().targetNoteId()).isEqualTo("target");
        assertThat(chunkRetrieval.queries).isEmpty();
        assertThat(aiChatPort.requests).hasSize(1);
        assertThat(aiChatPort.requests.getFirst().messages().get(1).content())
            .contains("noteId: target")
            .contains("noteId: other");
    }

    @Test
    void sourceOnlyWithoutCandidatesDoesNotCallLlm() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Source", "This note has no candidates."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyzeSourceLinks(new AutoLinkSourceCommand(
            "user-1",
            "group-1",
            "source",
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(result.status()).isEqualTo("COMPLETED");
        assertThat(result.analyzedNoteCount()).isEqualTo(1);
        assertThat(strategy.llmCallCount()).isZero();
        assertThat(strategy.candidatePairCount()).isZero();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(aiChatPort.requests).isEmpty();
    }

    @Test
    void vectorLlmFiltersSameNoteAndLowScoreBeforeLlm() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("a-source", "Source", "Alpha links to Beta concept."));
        projectionStore.notes.add(note("b-target", "Target", "Beta concept details."));
        projectionStore.notes.add(note("c-low", "Low", "Low score note."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        chunkRetrieval.queuedResults.add(List.of(
            chunk("a-source", "Source", 0.99d),
            chunk("c-low", "Low", 0.20d),
            chunk("b-target", "Target", 0.91d)
        ));
        chunkRetrieval.queuedResults.add(List.of());
        chunkRetrieval.queuedResults.add(List.of());
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Beta concept","targetNoteId":"b-target","reason":"vector candidate","confidence":0.9}]
            """);

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.VECTOR_LLM,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.candidatePairCount()).isEqualTo(1);
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.suggestions().getFirst().targetNoteId()).isEqualTo("b-target");
        assertThat(strategy.suggestions().getFirst().vectorScore()).isEqualTo(0.91d);
        assertThat(aiChatPort.requests.getFirst().messages().get(1).content())
            .contains("targetNoteId: b-target")
            .doesNotContain("targetNoteId: a-source")
            .doesNotContain("targetNoteId: c-low");
    }

    @Test
    void lowConfidenceAndGenericAnchorAreQualityFiltered() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Source", "Kafka and Detailed anchor phrase both appear."));
        projectionStore.notes.add(note("target", "Target", "Target details."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [
              {"anchorText":"Detailed anchor phrase","targetNoteId":"target","reason":"good","confidence":0.8},
              {"anchorText":"Detailed anchor phrase","targetNoteId":"target","reason":"weak","confidence":0.7},
              {"anchorText":"Kafka","targetNoteId":"target","reason":"generic","confidence":0.95}
            ]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.suggestions().getFirst().anchor().matchedText()).isEqualTo("Detailed anchor phrase");
        assertThat(strategy.filteredQualityCount()).isEqualTo(2);
    }

    @Test
    void vectorLlmRequiresStrongVectorScoreAfterLlm() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Source", "Detailed anchor phrase points to weak target."));
        projectionStore.notes.add(note("weak-target", "Weak Target", "Weak target details."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        chunkRetrieval.queuedResults.add(List.of(chunk("weak-target", "Weak Target", 0.55d)));
        chunkRetrieval.queuedResults.add(List.of());
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Detailed anchor phrase","targetNoteId":"weak-target","reason":"weak vector","confidence":0.95}]
            """);

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.VECTOR_LLM,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.candidatePairCount()).isEqualTo(1);
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredQualityCount()).isEqualTo(1);
    }

    @Test
    void sameSourceTargetKeepsBestSuggestionOnly() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note(
            "source",
            "Source",
            "Detailed anchor phrase and Another detailed anchor phrase are both present."
        ));
        projectionStore.notes.add(note("target", "Target", "Target details."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [
              {"anchorText":"Detailed anchor phrase","targetNoteId":"target","reason":"ok","confidence":0.8},
              {"anchorText":"Another detailed anchor phrase","targetNoteId":"target","reason":"better","confidence":0.95}
            ]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.suggestions().getFirst().anchor().matchedText()).isEqualTo("Another detailed anchor phrase");
        assertThat(strategy.filteredQualityCount()).isEqualTo(1);
    }

    @Test
    void targetFloodingIsLimited() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        for (int index = 1; index <= 6; index++) {
            projectionStore.notes.add(note(
                "source-" + index,
                "Source " + index,
                "Detailed anchor phrase " + index + " points to one target."
            ));
        }
        projectionStore.notes.add(note("z-target", "Target", "Target details."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        for (int index = 1; index <= 6; index++) {
            aiChatPort.responses.add("""
                [{"anchorText":"Detailed anchor phrase %d","targetNoteId":"z-target","reason":"same target","confidence":0.9}]
                """.formatted(index));
        }
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).hasSize(5);
        assertThat(strategy.suggestions()).allMatch(suggestion -> suggestion.targetNoteId().equals("z-target"));
        assertThat(strategy.filteredQualityCount()).isEqualTo(1);
    }

    @Test
    void duplicateNormalizedTitlesAreFiltered() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "BrainX - 뇌 탐사", "Detailed anchor phrase is here."));
        projectionStore.notes.add(note("target", "brainx 뇌 탐사 (Brain Exploration)", "Detailed target evidence."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Detailed anchor phrase","targetNoteId":"target","reason":"same title","confidence":0.95}]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredDuplicateTitleCount()).isEqualTo(1);
    }

    @Test
    void broadTargetWithLowOverlapIsWeakRelationFilteredByRule() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Save markdown file", "Local file persistence mentions Detailed anchor phrase."));
        projectionStore.notes.add(note("target", "BrainX 도메인 기준 MSA / API / 이벤트 계약", "Service contracts and event envelope."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Detailed anchor phrase","targetNoteId":"target","reason":"broad project topic","confidence":0.95}]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredWeakRelationCount()).isEqualTo(1);
        assertThat(aiChatPort.requests).hasSize(2);
    }

    @Test
    void broadTargetWithUnrelatedSourceTitleAndShallowAnchorOverlapIsWeakRelationFiltered() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Save markdown content to a file", "1. Database per Service"));
        projectionStore.notes.add(note(
            "target",
            "BrainX 도메인 기준 MSA / API / 이벤트 계약",
            "Database per Service and service ownership are described here."
        ));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Database per Service","targetNoteId":"target","reason":"database per service","confidence":0.95}]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredWeakRelationCount()).isEqualTo(1);
    }

    @Test
    void fileOperationTitleToBroadTargetIsWeakRelationFiltered() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note(
            "source",
            "Save the markdown content to a file",
            "### ① Database per Service (데이터 격리)"
        ));
        projectionStore.notes.add(note(
            "target",
            "BrainX 도메인 기준 MSA / API / 이벤트 계약",
            "Database per Service and event contract details."
        ));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Database per Service","targetNoteId":"target","reason":"too broad","confidence":0.95}]
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredWeakRelationCount()).isEqualTo(1);
    }

    @Test
    void relationVerifierKeepsAcceptedRelationAndRecordsUsage() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Workspace Notes", "Workspace contract anchor explains integration."));
        projectionStore.notes.add(note("target", "BrainX 도메인 기준 MSA / API / 이벤트 계약", "Workspace contract responsibility."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Workspace contract anchor","targetNoteId":"target","reason":"contract detail","confidence":0.95}]
            """);
        aiChatPort.responses.add("""
            {"relationType":"EXPANDS","confidence":0.86,"reason":"target expands the contract"}
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort, true).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).hasSize(1);
        assertThat(strategy.filteredWeakRelationCount()).isZero();
        assertThat(strategy.usageRecords()).extracting("featureId")
            .contains("note-auto-link-relation-verifier-chat");
        assertThat(aiChatPort.requests.getFirst().messages().getFirst().content())
            .contains("Mandatory user style instructions")
            .contains("every final user-facing conversational sentence");
        assertThat(aiChatPort.requests.get(1).messages().getFirst().content())
            .doesNotContain("Mandatory user style instructions")
            .doesNotContain("every final user-facing conversational sentence")
            .doesNotContain("every final generated or edited user-facing text segment");
        assertThat(strategy.usageSummary().inputTokens()).isEqualTo(30);
    }

    @Test
    void relationVerifierRejectsWeakRelation() {
        FakeNoteSourcePort projectionStore = new FakeNoteSourcePort();
        projectionStore.notes.add(note("source", "Workspace Notes", "Workspace contract anchor explains integration."));
        projectionStore.notes.add(note("target", "BrainX 도메인 기준 MSA / API / 이벤트 계약", "Workspace contract responsibility."));
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        FakeAiChatPort aiChatPort = new FakeAiChatPort();
        aiChatPort.responses.add("""
            [{"anchorText":"Workspace contract anchor","targetNoteId":"target","reason":"too broad","confidence":0.95}]
            """);
        aiChatPort.responses.add("""
            {"relationType":"BROAD_TOPIC","confidence":0.92,"reason":"only broad domain"}
            """);
        aiChatPort.responses.add("[]");

        var result = service(projectionStore, chunkRetrieval, aiChatPort, true).analyze(new AutoLinkCommand(
            "user-1",
            "group-1",
            NoteAutoLinkStrategy.LLM_ONLY,
            50,
            "gpt-5.4-mini"
        ));

        var strategy = result.strategies().getFirst();
        assertThat(strategy.suggestions()).isEmpty();
        assertThat(strategy.filteredWeakRelationCount()).isEqualTo(1);
    }

    private static NoteAutoLinkService service(
        FakeNoteSourcePort projectionStore,
        FakeChunkRetrieval chunkRetrieval,
        FakeAiChatPort aiChatPort
    ) {
        return service(projectionStore, chunkRetrieval, aiChatPort, false);
    }

    private static NoteAutoLinkService service(
        FakeNoteSourcePort projectionStore,
        FakeChunkRetrieval chunkRetrieval,
        FakeAiChatPort aiChatPort,
        boolean relationVerifierEnabled
    ) {
        NoteAutoLinkProperties properties = new NoteAutoLinkProperties();
        properties.setMaxNotes(50);
        properties.setRelationVerifierEnabled(relationVerifierEnabled);
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        FakeUsageCapture usageCapture = new FakeUsageCapture();
        beanFactory.registerSingleton("autoLinkUsageCapturePort", usageCapture);
        FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
        usageCapture.delegate = tokenUsagePort;
        AiTokenUsageCostEstimator usageCostEstimator = new AiTokenUsageCostEstimator(new FakeAiModelCatalog());
        return new NoteAutoLinkService(
            properties,
            projectionStore,
            chunkRetrieval,
            aiChatPort,
            new AiUsageRecorder(usageCapture, usageCostEstimator),
            new ObjectMapper().findAndRegisterModules(),
            beanFactory.getBeanProvider(AutoLinkUsageCapturePort.class),
            new StylePromptCompiler(new FakeStyleProfilePort())
        );
    }

    private static AutoLinkNoteSource note(String noteId, String title, String markdown) {
        return new AutoLinkNoteSource(
            "user-1",
            "group-1",
            noteId,
            title,
            List.of("tag"),
            "hash-" + noteId,
            markdown,
            Instant.parse("2026-06-19T00:00:00Z")
        );
    }

    private static NoteChunkSearchResult chunk(String noteId, String title, double score) {
        return new NoteChunkSearchResult(
            "user-1",
            "group-1",
            noteId,
            noteId + "::0",
            0,
            title,
            title + " chunk",
            score,
            "hash-" + noteId,
            1,
            null,
            null
        );
    }

    private static final class FakeNoteSourcePort implements AutoLinkNoteSourcePort {

        private final List<AutoLinkNoteSource> notes = new ArrayList<>();

        @Override
        public List<AutoLinkNoteSource> findSearchableNoteSources(
            String userId,
            String documentGroupId,
            int limit
        ) {
            return notes.stream()
                .filter(note -> note.userId().equals(userId)
                    && note.documentGroupId().equals(documentGroupId)
                    && note.markdown() != null)
                .limit(limit)
                .toList();
        }

        @Override
        public Optional<AutoLinkNoteSource> findSearchableNoteSource(
            String userId,
            String documentGroupId,
            String noteId
        ) {
            return notes.stream()
                .filter(note -> note.userId().equals(userId)
                    && note.documentGroupId().equals(documentGroupId)
                    && note.noteId().equals(noteId)
                    && note.markdown() != null)
                .findFirst();
        }
    }

    private static final class FakeChunkRetrieval implements NoteChunkRetrievalPort {

        private final List<NoteChunkSearchQuery> queries = new ArrayList<>();
        private final ArrayDeque<List<NoteChunkSearchResult>> queuedResults = new ArrayDeque<>();
        private List<NoteChunkSearchResult> results = List.of();

        @Override
        public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
            queries.add(query);
            return queuedResults.isEmpty() ? results : queuedResults.removeFirst();
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private final ArrayDeque<String> responses = new ArrayDeque<>();
        private final List<AiChatRequest> requests = new ArrayList<>();

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            requests.add(request);
            String content = responses.isEmpty() ? "[]" : responses.removeFirst();
            return new AiChatResponse(content, new AiTokenUsage(10, 2, 12, 1, 0));
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }

    private static final class FakeUsageCapture implements TokenUsagePort, AutoLinkUsageCapturePort {

        private final List<TokenUsageRecord> current = new ArrayList<>();
        private TokenUsagePort delegate;

        @Override
        public void begin() {
            current.clear();
        }

        @Override
        public List<TokenUsageRecord> drain() {
            List<TokenUsageRecord> records = List.copyOf(current);
            current.clear();
            return records;
        }

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            current.add(record);
            if (delegate != null) {
                delegate.recordTokenUsage(record);
            }
        }
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalog implements AiModelCatalogPort {

        private static final AiModel MODEL = new AiModel(
            "gpt-5.4-mini",
            "GPT-5.4 mini",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.010000"),
                new BigDecimal("0.002000"),
                new BigDecimal("0.030000"),
                "USD"
            )
        );

        @Override
        public List<AiModel> findAll() {
            return List.of(MODEL);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return MODEL.modelId().equals(modelId) ? Optional.of(MODEL) : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return MODEL.modelId().equals(modelId);
        }
    }

    private static final class FakeStyleProfilePort implements StyleProfilePort {

        private final StyleProfile profile = new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("directness", "high")),
            new WritingStyle(Map.of("formality", "business")),
            null
        );

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return profile.userId().equals(userId) ? Optional.of(profile) : Optional.empty();
        }
    }
}
