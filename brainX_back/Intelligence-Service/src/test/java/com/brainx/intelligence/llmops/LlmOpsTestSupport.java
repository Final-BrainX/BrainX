package com.brainx.intelligence.llmops;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.LlmOpsProperties;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.domain.EvalResult;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalScenario;
import com.brainx.intelligence.llmops.domain.EvalSet;
import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.PromptDefinition;
import com.brainx.intelligence.llmops.domain.PromptVersion;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

public final class LlmOpsTestSupport {

    private LlmOpsTestSupport() {
    }

    public static LlmOpsStore store() {
        return new InMemoryLlmOpsStore();
    }

    public static AiRunRecorder runRecorder(LlmOpsStore store) {
        return new AiRunRecorder(store, new AiTokenUsageCostEstimator(new EmptyModelCatalog()), new LlmOpsProperties());
    }

    public static PromptRegistryService promptRegistry(LlmOpsStore store) {
        return new PromptRegistryService(store);
    }

    static final class InMemoryLlmOpsStore implements LlmOpsStore {

        private final Map<String, LlmRun> runs = new LinkedHashMap<>();
        private final Map<String, LlmFeedback> feedback = new LinkedHashMap<>();
        private final Map<String, PromptDefinition> promptDefinitions = new LinkedHashMap<>();
        private final Map<String, PromptVersion> promptVersions = new LinkedHashMap<>();
        private final Map<String, EvalSet> evalSets = new LinkedHashMap<>();
        private final Map<String, EvalScenario> scenarios = new LinkedHashMap<>();
        private final Map<String, EvalRun> evalRuns = new LinkedHashMap<>();
        private final Map<String, EvalResult> results = new LinkedHashMap<>();

        @Override
        public LlmRun saveRun(LlmRun run) {
            runs.put(run.llmRunId(), run);
            return run;
        }

        @Override
        public Optional<LlmRun> findRunById(String llmRunId) {
            return Optional.ofNullable(runs.get(llmRunId));
        }

        @Override
        public List<LlmRun> listRuns(String userId, String featureId, String status, int limit) {
            return runs.values().stream()
                .filter(run -> userId == null || userId.equals(run.userId()))
                .filter(run -> featureId == null || featureId.equals(run.featureId()))
                .filter(run -> status == null || status.equals(run.status().name()))
                .limit(Math.max(1, limit))
                .toList();
        }

        @Override
        public LlmFeedback upsertFeedback(LlmFeedback item) {
            feedback.put(item.userId() + "::" + item.llmRunId(), item);
            return item;
        }

        @Override
        public List<LlmFeedback> listFeedback(String userId, String llmRunId, int limit) {
            return feedback.values().stream()
                .filter(item -> userId == null || userId.equals(item.userId()))
                .filter(item -> llmRunId == null || llmRunId.equals(item.llmRunId()))
                .limit(Math.max(1, limit))
                .toList();
        }

        @Override
        public PromptDefinition savePromptDefinition(PromptDefinition definition) {
            promptDefinitions.put(definition.promptKey(), definition);
            return definition;
        }

        @Override
        public List<PromptDefinition> listPromptDefinitions() {
            return List.copyOf(promptDefinitions.values());
        }

        @Override
        public PromptVersion savePromptVersion(PromptVersion version) {
            promptVersions.put(version.promptVersionId(), version);
            return version;
        }

        @Override
        public Optional<PromptVersion> findActivePromptVersion(String promptKey) {
            return promptVersions.values().stream()
                .filter(version -> version.promptKey().equals(promptKey))
                .filter(version -> version.status().name().equals("ACTIVE"))
                .findFirst();
        }

        @Override
        public Optional<PromptVersion> activatePromptVersion(String promptKey, int version) {
            return promptVersions.values().stream()
                .filter(item -> item.promptKey().equals(promptKey) && item.version() == version)
                .findFirst()
                .map(item -> {
                    PromptVersion active = item.active(Instant.now());
                    promptVersions.put(active.promptVersionId(), active);
                    return active;
                });
        }

        @Override
        public EvalSet saveEvalSet(EvalSet evalSet) {
            evalSets.put(evalSet.evalSetId(), evalSet);
            return evalSet;
        }

        @Override
        public Optional<EvalSet> findEvalSet(String evalSetId) {
            return Optional.ofNullable(evalSets.get(evalSetId));
        }

        @Override
        public EvalScenario saveEvalScenario(EvalScenario scenario) {
            scenarios.put(scenario.scenarioId(), scenario);
            return scenario;
        }

        @Override
        public List<EvalScenario> listEvalScenarios(String evalSetId) {
            return scenarios.values().stream()
                .filter(scenario -> scenario.evalSetId().equals(evalSetId))
                .toList();
        }

        @Override
        public EvalRun saveEvalRun(EvalRun run) {
            evalRuns.put(run.evalRunId(), run);
            return run;
        }

        @Override
        public Optional<EvalRun> findEvalRun(String evalRunId) {
            return Optional.ofNullable(evalRuns.get(evalRunId));
        }

        @Override
        public EvalResult saveEvalResult(EvalResult result) {
            results.put(result.resultId(), result);
            return result;
        }

        @Override
        public List<EvalResult> listEvalResults(String evalRunId) {
            return new ArrayList<>(results.values()).stream()
                .filter(result -> result.evalRunId().equals(evalRunId))
                .toList();
        }
    }

    private static final class EmptyModelCatalog implements com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort {
        @Override
        public List<com.brainx.intelligence.settings.domain.AiModel> findAll() {
            return List.of();
        }

        @Override
        public Optional<com.brainx.intelligence.settings.domain.AiModel> findByModelId(String modelId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return false;
        }
    }
}
