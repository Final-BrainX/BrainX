package com.brainx.intelligence.llmops.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.llmops.LlmOpsTestSupport;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.EvalFailureType;
import com.brainx.intelligence.llmops.domain.EvalScenarioType;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.LlmRunStatus;
import com.brainx.intelligence.llmops.domain.PromptVersionStatus;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatChunk;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;

import reactor.core.publisher.Flux;

class LlmOpsServiceTest {

    private final LlmOpsStore store = LlmOpsTestSupport.store();

    @Test
    void feedbackUpsertsByUserAndRunAndBlocksOtherUsers() {
        store.saveRun(new LlmRun(
            "run-1",
            "user-1",
            "rag-chat",
            "CHAT_MESSAGE",
            "message-1",
            "chat.note-qa",
            "code",
            "gpt-test",
            "openai",
            LlmRunStatus.SUCCEEDED,
            10L,
            1,
            0,
            1,
            1,
            0,
            2,
            null,
            null,
            null,
            null,
            null,
            Map.of(),
            Map.of("contentPreview", "answer"),
            Map.of(),
            null,
            null,
            Instant.now(),
            Instant.now()
        ));
        LlmFeedbackService service = new LlmFeedbackService(store);

        var first = service.submitFeedback("user-1", "run-1", LlmFeedbackRating.LIKE, "helpful", "좋음");
        var second = service.submitFeedback("user-1", "run-1", LlmFeedbackRating.DISLIKE, "wrong", "틀림");

        assertThat(first.llmRunId()).isEqualTo("run-1");
        assertThat(second.rating()).isEqualTo(LlmFeedbackRating.DISLIKE);
        assertThat(service.listFeedback("user-1", "run-1", 10)).hasSize(1);
        assertThatThrownBy(() -> service.submitFeedback("user-2", "run-1", LlmFeedbackRating.LIKE, null, null))
            .isInstanceOf(LlmOpsNotFoundException.class)
            .hasMessageContaining("LLM run not found");
    }

    @Test
    void promptRegistryFallsBackToCodeAndUsesActivatedVersion() {
        PromptRegistryService service = new PromptRegistryService(store);

        assertThat(service.resolve("inline-assist", "code prompt").version()).isEqualTo("code");

        service.saveDefinition("inline-assist", "inline-assist-chat", "assist prompt", Map.of());
        var draft = service.createVersion("inline-assist", 2, "db prompt", Map.of("language", "string"));
        var active = service.activateVersion("inline-assist", draft.version());

        assertThat(active.status()).isEqualTo(PromptVersionStatus.ACTIVE);
        var resolved = service.resolve("inline-assist", "code prompt");
        assertThat(resolved.version()).isEqualTo("2");
        assertThat(resolved.template()).isEqualTo("db prompt");
    }

    @Test
    void evalRunSeparatesQualityFailureFromProviderFailure() {
        FakeAiChatPort chatPort = new FakeAiChatPort();
        EvalRunnerService service = new EvalRunnerService(store, chatPort, LlmOpsTestSupport.runRecorder(store));
        var set = service.createEvalSet("basic", "desc");
        service.createScenario(
            set.evalSetId(),
            EvalScenarioType.PROMPT_COMPLETION,
            "contains expected",
            Map.of("prompt", "say ok"),
            Map.of("answerMustContain", List.of("expected"))
        );
        chatPort.response = new AiChatResponse("other answer", new AiTokenUsage(10, 2, 12));

        var qualityRun = service.runEval(set.evalSetId(), "gpt-test");

        assertThat(qualityRun.failedCount()).isEqualTo(1);
        assertThat(qualityRun.failureType()).isEqualTo(EvalFailureType.QUALITY);
        var qualityResult = service.listResults(qualityRun.evalRunId()).getFirst();
        assertThat(qualityResult.llmRunId()).isNotBlank();
        assertThat(store.findRunById(qualityResult.llmRunId())).isPresent();

        var providerSet = service.createEvalSet("provider", null);
        service.createScenario(
            providerSet.evalSetId(),
            EvalScenarioType.PROMPT_COMPLETION,
            "provider error",
            Map.of("prompt", "fail"),
            Map.of()
        );
        chatPort.failure = new IllegalStateException("quota");

        var providerRun = service.runEval(providerSet.evalSetId(), "gpt-test");

        assertThat(providerRun.failedCount()).isEqualTo(1);
        assertThat(providerRun.failureType()).isEqualTo(EvalFailureType.PROVIDER);
        var providerResult = service.listResults(providerRun.evalRunId()).getFirst();
        assertThat(providerResult.llmRunId()).isNotBlank();
        assertThat(store.findRunById(providerResult.llmRunId())).isPresent();
    }

    private static final class FakeAiChatPort implements AiChatPort {
        private AiChatResponse response = new AiChatResponse("ok", new AiTokenUsage(1, 1, 2));
        private RuntimeException failure;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            if (failure != null) {
                throw failure;
            }
            return response;
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }
}
