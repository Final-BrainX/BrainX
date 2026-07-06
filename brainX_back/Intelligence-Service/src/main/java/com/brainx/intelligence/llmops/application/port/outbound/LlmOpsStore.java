package com.brainx.intelligence.llmops.application.port.outbound;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.brainx.intelligence.llmops.domain.EvalResult;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalScenario;
import com.brainx.intelligence.llmops.domain.EvalSet;
import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.PromptDefinition;
import com.brainx.intelligence.llmops.domain.PromptVersion;

public interface LlmOpsStore {

    LlmRun saveRun(LlmRun run);

    Optional<LlmRun> findRunById(String llmRunId);

    List<LlmRun> listRuns(String userId, String featureId, String status, int limit);

    LlmFeedback upsertFeedback(LlmFeedback feedback);

    List<LlmFeedback> listFeedback(String userId, String llmRunId, int limit);

    PromptDefinition savePromptDefinition(PromptDefinition definition);

    List<PromptDefinition> listPromptDefinitions();

    PromptVersion savePromptVersion(PromptVersion version);

    Optional<PromptVersion> findActivePromptVersion(String promptKey);

    Optional<PromptVersion> activatePromptVersion(String promptKey, int version);

    EvalSet saveEvalSet(EvalSet evalSet);

    Optional<EvalSet> findEvalSet(String evalSetId);

    EvalScenario saveEvalScenario(EvalScenario scenario);

    List<EvalScenario> listEvalScenarios(String evalSetId);

    EvalRun saveEvalRun(EvalRun run);

    Optional<EvalRun> findEvalRun(String evalRunId);

    EvalResult saveEvalResult(EvalResult result);

    List<EvalResult> listEvalResults(String evalRunId);

    default Map<String, Object> evalRunDetail(EvalRun run) {
        return Map.of(
            "run", run,
            "results", listEvalResults(run.evalRunId())
        );
    }
}
