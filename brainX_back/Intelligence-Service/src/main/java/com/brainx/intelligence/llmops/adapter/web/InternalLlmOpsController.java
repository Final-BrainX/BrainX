package com.brainx.intelligence.llmops.adapter.web;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.application.service.EvalRunnerService;
import com.brainx.intelligence.llmops.application.service.LlmFeedbackService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.domain.EvalScenarioType;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;
import com.brainx.intelligence.llmops.domain.PromptDefinition;
import com.brainx.intelligence.llmops.domain.PromptVersion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@Validated
public class InternalLlmOpsController {

    private final LlmOpsStore store;
    private final LlmFeedbackService feedbackService;
    private final PromptRegistryService promptRegistryService;
    private final EvalRunnerService evalRunnerService;

    public InternalLlmOpsController(
        LlmOpsStore store,
        LlmFeedbackService feedbackService,
        PromptRegistryService promptRegistryService,
        EvalRunnerService evalRunnerService
    ) {
        this.store = store;
        this.feedbackService = feedbackService;
        this.promptRegistryService = promptRegistryService;
        this.evalRunnerService = evalRunnerService;
    }

    @GetMapping("/internal/v1/intelligence/llmops/runs")
    public ApiSuccessResponse<LlmRunsData> listRuns(
        @RequestParam(required = false) String userId,
        @RequestParam(required = false) String featureId,
        @RequestParam(required = false) String status,
        @RequestParam(required = false, defaultValue = "50") int limit
    ) {
        return ApiSuccessResponse.ok(new LlmRunsData(store.listRuns(userId, featureId, status, limit)));
    }

    @GetMapping("/internal/v1/intelligence/llmops/runs/{llmRunId}")
    public ApiSuccessResponse<Object> getRun(@PathVariable @NotBlank String llmRunId) {
        return ApiSuccessResponse.ok(store.findRunById(llmRunId)
            .orElseThrow(() -> new LlmOpsNotFoundException("LLM run not found.")));
    }

    @GetMapping("/internal/v1/intelligence/llmops/feedback")
    public ApiSuccessResponse<LlmFeedbackListData> listFeedback(
        @RequestParam(required = false) String userId,
        @RequestParam(required = false) String llmRunId,
        @RequestParam(required = false, defaultValue = "50") int limit
    ) {
        return ApiSuccessResponse.ok(new LlmFeedbackListData(feedbackService.listFeedback(userId, llmRunId, limit)));
    }

    @PutMapping("/internal/v1/intelligence/llmops/prompts/{promptKey}")
    public ApiSuccessResponse<PromptDefinition> savePromptDefinition(
        @PathVariable @NotBlank String promptKey,
        @Valid @RequestBody PromptDefinitionRequest request
    ) {
        return ApiSuccessResponse.ok(promptRegistryService.saveDefinition(
            promptKey,
            request.featureId(),
            request.description(),
            request.variableSchema()
        ));
    }

    @GetMapping("/internal/v1/intelligence/llmops/prompts")
    public ApiSuccessResponse<PromptDefinitionsData> listPrompts() {
        return ApiSuccessResponse.ok(new PromptDefinitionsData(promptRegistryService.listDefinitions()));
    }

    @PostMapping("/internal/v1/intelligence/llmops/prompts/{promptKey}/versions")
    public ApiSuccessResponse<PromptVersion> createPromptVersion(
        @PathVariable @NotBlank String promptKey,
        @Valid @RequestBody PromptVersionCreateRequest request
    ) {
        return ApiSuccessResponse.ok(promptRegistryService.createVersion(
            promptKey,
            request.version(),
            request.template(),
            request.variableSchema()
        ));
    }

    @PostMapping("/internal/v1/intelligence/llmops/prompts/{promptKey}/versions/{version}/activate")
    public ApiSuccessResponse<PromptVersion> activatePromptVersion(
        @PathVariable @NotBlank String promptKey,
        @PathVariable int version
    ) {
        return ApiSuccessResponse.ok(promptRegistryService.activateVersion(promptKey, version));
    }

    @PostMapping("/internal/v1/intelligence/llmops/eval-sets")
    public ApiSuccessResponse<EvalSetData> createEvalSet(@Valid @RequestBody EvalSetCreateRequest request) {
        var evalSet = evalRunnerService.createEvalSet(request.name(), request.description());
        return ApiSuccessResponse.ok(new EvalSetData(
            evalSet,
            evalRunnerService.listScenarios(evalSet.evalSetId())
        ));
    }

    @GetMapping("/internal/v1/intelligence/llmops/eval-sets/{evalSetId}")
    public ApiSuccessResponse<EvalSetData> getEvalSet(@PathVariable @NotBlank String evalSetId) {
        return ApiSuccessResponse.ok(new EvalSetData(
            evalRunnerService.getEvalSet(evalSetId),
            evalRunnerService.listScenarios(evalSetId)
        ));
    }

    @PostMapping("/internal/v1/intelligence/llmops/eval-sets/{evalSetId}/scenarios")
    public ApiSuccessResponse<Object> createEvalScenario(
        @PathVariable @NotBlank String evalSetId,
        @Valid @RequestBody EvalScenarioCreateRequest request
    ) {
        return ApiSuccessResponse.ok(evalRunnerService.createScenario(
            evalSetId,
            request.scenarioType(),
            request.name(),
            request.input(),
            request.validation()
        ));
    }

    @PostMapping("/internal/v1/intelligence/llmops/eval-runs")
    public ApiSuccessResponse<EvalRunData> runEval(@Valid @RequestBody EvalRunCreateRequest request) {
        var run = evalRunnerService.runEval(request.evalSetId(), request.modelId());
        return ApiSuccessResponse.ok(new EvalRunData(
            run,
            evalRunnerService.listResults(run.evalRunId())
        ));
    }

    @GetMapping("/internal/v1/intelligence/llmops/eval-runs/{evalRunId}")
    public ApiSuccessResponse<EvalRunData> getEvalRun(@PathVariable @NotBlank String evalRunId) {
        var run = evalRunnerService.getEvalRun(evalRunId);
        return ApiSuccessResponse.ok(new EvalRunData(run, evalRunnerService.listResults(evalRunId)));
    }

    record LlmRunsData(List<?> runs) {
    }

    record LlmFeedbackListData(List<?> feedback) {
    }

    record PromptDefinitionsData(List<PromptDefinition> prompts) {
    }

    record PromptDefinitionRequest(
        String featureId,
        String description,
        Map<String, Object> variableSchema
    ) {
    }

    record PromptVersionCreateRequest(
        Integer version,
        @NotBlank String template,
        Map<String, Object> variableSchema
    ) {
    }

    record EvalSetCreateRequest(
        @NotBlank String name,
        String description
    ) {
    }

    record EvalScenarioCreateRequest(
        @NotNull EvalScenarioType scenarioType,
        @NotBlank String name,
        Map<String, Object> input,
        Map<String, Object> validation
    ) {
    }

    record EvalRunCreateRequest(
        @NotBlank String evalSetId,
        @NotBlank String modelId
    ) {
    }

    record EvalSetData(Object evalSet, List<?> scenarios) {
    }

    record EvalRunData(Object run, List<?> results) {
    }
}
