package com.brainx.intelligence.llmops.application.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.EvalFailureType;
import com.brainx.intelligence.llmops.domain.EvalResult;
import com.brainx.intelligence.llmops.domain.EvalResultStatus;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalRunStatus;
import com.brainx.intelligence.llmops.domain.EvalScenario;
import com.brainx.intelligence.llmops.domain.EvalScenarioType;
import com.brainx.intelligence.llmops.domain.EvalSet;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;

@Service
public class EvalRunnerService {

    private static final String EVAL_USER_ID = "internal-llmops";
    private static final String FEATURE_ID = "llmops-eval-chat";
    private static final String PROMPT_KEY = "llmops.eval";

    private final LlmOpsStore store;
    private final AiChatPort aiChatPort;
    private final AiRunRecorder aiRunRecorder;

    public EvalRunnerService(
        LlmOpsStore store,
        AiChatPort aiChatPort,
        AiRunRecorder aiRunRecorder
    ) {
        this.store = store;
        this.aiChatPort = aiChatPort;
        this.aiRunRecorder = aiRunRecorder;
    }

    public EvalSet createEvalSet(String name, String description) {
        return store.saveEvalSet(new EvalSet(UUID.randomUUID().toString(), name, description, Instant.now()));
    }

    public EvalScenario createScenario(
        String evalSetId,
        EvalScenarioType scenarioType,
        String name,
        Map<String, Object> input,
        Map<String, Object> validation
    ) {
        store.findEvalSet(evalSetId).orElseThrow(() -> new LlmOpsNotFoundException("Eval set not found."));
        return store.saveEvalScenario(new EvalScenario(
            UUID.randomUUID().toString(),
            evalSetId,
            scenarioType,
            name,
            input,
            validation,
            Instant.now()
        ));
    }

    public EvalRun runEval(String evalSetId, String modelId) {
        store.findEvalSet(evalSetId).orElseThrow(() -> new LlmOpsNotFoundException("Eval set not found."));
        List<EvalScenario> scenarios = store.listEvalScenarios(evalSetId);
        EvalRun run = store.saveEvalRun(new EvalRun(
            UUID.randomUUID().toString(),
            evalSetId,
            EvalRunStatus.RUNNING,
            modelId,
            scenarios.size(),
            0,
            0,
            null,
            null,
            Instant.now(),
            null
        ));

        int passed = 0;
        int failed = 0;
        EvalFailureType aggregateFailureType = null;
        String aggregateFailureMessage = null;
        for (EvalScenario scenario : scenarios) {
            EvalResult result = runScenario(run.evalRunId(), modelId, scenario);
            store.saveEvalResult(result);
            if (result.status() == EvalResultStatus.PASSED) {
                passed += 1;
            } else {
                failed += 1;
                aggregateFailureType = aggregateFailureType == null ? result.failureType() : aggregateFailureType;
                aggregateFailureMessage = aggregateFailureMessage == null ? result.failureMessage() : aggregateFailureMessage;
            }
        }
        EvalRun completed = run.completed(scenarios.size(), passed, failed, aggregateFailureType, aggregateFailureMessage, Instant.now());
        return store.saveEvalRun(completed);
    }

    public EvalRun getEvalRun(String evalRunId) {
        return store.findEvalRun(evalRunId).orElseThrow(() -> new LlmOpsNotFoundException("Eval run not found."));
    }

    public EvalSet getEvalSet(String evalSetId) {
        return store.findEvalSet(evalSetId).orElseThrow(() -> new LlmOpsNotFoundException("Eval set not found."));
    }

    public List<EvalScenario> listScenarios(String evalSetId) {
        return store.listEvalScenarios(evalSetId);
    }

    public List<EvalResult> listResults(String evalRunId) {
        return store.listEvalResults(evalRunId);
    }

    private EvalResult runScenario(String evalRunId, String modelId, EvalScenario scenario) {
        Instant startedAt = Instant.now();
        String resolvedModelId = textValue(scenario.input().get("modelId"), modelId);
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, textValue(scenario.input().get("systemPrompt"), "You are BrainX LLMOps evaluation target.")),
            new AiChatMessage(AiRole.USER, textValue(scenario.input().get("prompt"), textValue(scenario.input().get("userPrompt"), "")))
        );
        AiRunRecorder.RunHandle runHandle = aiRunRecorder.startChatRun(
            EVAL_USER_ID,
            FEATURE_ID,
            PROMPT_KEY,
            "code",
            requireText(resolvedModelId, "modelId"),
            "EVAL_SCENARIO",
            scenario.scenarioId(),
            messages,
            Map.of("evalRunId", evalRunId, "scenarioType", scenario.scenarioType().name())
        );
        try {
            var response = aiChatPort.generate(new AiChatRequest(resolvedModelId, messages));
            String content = response == null ? "" : response.content();
            aiRunRecorder.complete(runHandle, resolvedModelId, content, response == null ? null : response.tokenUsage());
            List<String> failures = validationFailures(scenario.validation(), content);
            boolean passed = failures.isEmpty();
            return new EvalResult(
                UUID.randomUUID().toString(),
                evalRunId,
                scenario.scenarioId(),
                passed ? EvalResultStatus.PASSED : EvalResultStatus.FAILED,
                Map.of("answer", content == null ? "" : content),
                passed ? null : EvalFailureType.QUALITY,
                passed ? null : String.join("; ", failures),
                runHandle.llmRunId(),
                Math.max(0, java.time.Duration.between(startedAt, Instant.now()).toMillis()),
                Instant.now()
            );
        } catch (RuntimeException exception) {
            aiRunRecorder.fail(runHandle, exception);
            return new EvalResult(
                UUID.randomUUID().toString(),
                evalRunId,
                scenario.scenarioId(),
                EvalResultStatus.FAILED,
                Map.of(),
                EvalFailureType.PROVIDER,
                exception.getMessage(),
                runHandle.llmRunId(),
                Math.max(0, java.time.Duration.between(startedAt, Instant.now()).toMillis()),
                Instant.now()
            );
        }
    }

    private static List<String> validationFailures(Map<String, Object> validation, String answer) {
        String text = answer == null ? "" : answer;
        List<String> failures = new ArrayList<>();
        for (String required : stringList(validation.get("answerMustContain"))) {
            if (!text.contains(required)) {
                failures.add("answer missing required text: " + required);
            }
        }
        for (String forbidden : stringList(validation.get("answerMustNotContain"))) {
            if (text.contains(forbidden)) {
                failures.add("answer contains forbidden text: " + forbidden);
            }
        }
        if (Boolean.TRUE.equals(validation.get("requireJson"))) {
            String trimmed = text.trim();
            if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
                failures.add("answer is not a JSON object");
            }
        }
        return failures;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        return items.stream()
            .map(item -> item == null ? "" : item.toString())
            .filter(StringUtils::hasText)
            .toList();
    }

    private static String textValue(Object first, String fallback) {
        if (first != null && StringUtils.hasText(first.toString())) {
            return first.toString().trim();
        }
        return fallback == null ? "" : fallback;
    }

    private static String requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
