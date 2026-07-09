package com.brainx.intelligence.llmops.adapter.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.application.service.EvalRunnerService;
import com.brainx.intelligence.llmops.application.service.LlmFeedbackService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalRunStatus;
import com.brainx.intelligence.llmops.domain.EvalSet;

class InternalLlmOpsControllerTest {

    private final EvalRunnerService evalRunnerService = mock(EvalRunnerService.class);
    private final InternalLlmOpsController controller = new InternalLlmOpsController(
        mock(LlmOpsStore.class),
        mock(LlmFeedbackService.class),
        mock(PromptRegistryService.class),
        evalRunnerService
    );

    @Test
    void createEvalSetReturnsContractWrapperWithScenarios() {
        EvalSet evalSet = new EvalSet(
            "set-1",
            "Regression",
            null,
            Instant.parse("2026-07-10T00:00:00Z")
        );
        when(evalRunnerService.createEvalSet("Regression", null)).thenReturn(evalSet);
        when(evalRunnerService.listScenarios("set-1")).thenReturn(List.of());

        var response = controller.createEvalSet(
            new InternalLlmOpsController.EvalSetCreateRequest("Regression", null)
        );

        assertThat(response.data().evalSet()).isEqualTo(evalSet);
        assertThat(response.data().scenarios()).isEmpty();
    }

    @Test
    void runEvalReturnsContractWrapperWithResults() {
        EvalRun run = new EvalRun(
            "run-1",
            "set-1",
            EvalRunStatus.COMPLETED,
            "gpt-test",
            0,
            0,
            0,
            null,
            null,
            Instant.parse("2026-07-10T00:00:00Z"),
            Instant.parse("2026-07-10T00:00:01Z")
        );
        when(evalRunnerService.runEval("set-1", "gpt-test")).thenReturn(run);
        when(evalRunnerService.listResults("run-1")).thenReturn(List.of());

        var response = controller.runEval(
            new InternalLlmOpsController.EvalRunCreateRequest("set-1", "gpt-test")
        );

        assertThat(response.data().run()).isEqualTo(run);
        assertThat(response.data().results()).isEmpty();
    }
}
