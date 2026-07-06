package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.EvalResult;
import com.brainx.intelligence.llmops.domain.EvalRun;
import com.brainx.intelligence.llmops.domain.EvalScenario;
import com.brainx.intelligence.llmops.domain.EvalSet;
import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmRun;
import com.brainx.intelligence.llmops.domain.LlmRunStatus;
import com.brainx.intelligence.llmops.domain.PromptDefinition;
import com.brainx.intelligence.llmops.domain.PromptVersion;
import com.brainx.intelligence.llmops.domain.PromptVersionStatus;

@Repository
public class LlmOpsJpaAdapter implements LlmOpsStore {

    private final LlmRunJpaRepository runRepository;
    private final LlmFeedbackJpaRepository feedbackRepository;
    private final PromptDefinitionJpaRepository promptDefinitionRepository;
    private final PromptVersionJpaRepository promptVersionRepository;
    private final EvalSetJpaRepository evalSetRepository;
    private final EvalScenarioJpaRepository evalScenarioRepository;
    private final EvalRunJpaRepository evalRunRepository;
    private final EvalResultJpaRepository evalResultRepository;

    public LlmOpsJpaAdapter(
        LlmRunJpaRepository runRepository,
        LlmFeedbackJpaRepository feedbackRepository,
        PromptDefinitionJpaRepository promptDefinitionRepository,
        PromptVersionJpaRepository promptVersionRepository,
        EvalSetJpaRepository evalSetRepository,
        EvalScenarioJpaRepository evalScenarioRepository,
        EvalRunJpaRepository evalRunRepository,
        EvalResultJpaRepository evalResultRepository
    ) {
        this.runRepository = runRepository;
        this.feedbackRepository = feedbackRepository;
        this.promptDefinitionRepository = promptDefinitionRepository;
        this.promptVersionRepository = promptVersionRepository;
        this.evalSetRepository = evalSetRepository;
        this.evalScenarioRepository = evalScenarioRepository;
        this.evalRunRepository = evalRunRepository;
        this.evalResultRepository = evalResultRepository;
    }

    @Override
    @Transactional
    public LlmRun saveRun(LlmRun run) {
        return runRepository.save(LlmRunJpaEntity.fromDomain(run)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<LlmRun> findRunById(String llmRunId) {
        return runRepository.findById(llmRunId).map(LlmRunJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LlmRun> listRuns(String userId, String featureId, String status, int limit) {
        return runRepository.listRuns(
                blankToNull(userId),
                blankToNull(featureId),
                statusValue(status),
                PageRequest.of(0, normalizeLimit(limit))
            ).stream()
            .map(LlmRunJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public LlmFeedback upsertFeedback(LlmFeedback feedback) {
        Optional<LlmFeedbackJpaEntity> existing = feedbackRepository.findByUserIdAndLlmRunId(
            feedback.userId(),
            feedback.llmRunId()
        );
        if (existing.isPresent()) {
            LlmFeedbackJpaEntity entity = existing.get();
            entity.update(feedback);
            return feedbackRepository.save(entity).toDomain();
        }
        return feedbackRepository.save(LlmFeedbackJpaEntity.fromDomain(feedback)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<LlmFeedback> listFeedback(String userId, String llmRunId, int limit) {
        return feedbackRepository.listFeedback(
                blankToNull(userId),
                blankToNull(llmRunId),
                PageRequest.of(0, normalizeLimit(limit))
            ).stream()
            .map(LlmFeedbackJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public PromptDefinition savePromptDefinition(PromptDefinition definition) {
        return promptDefinitionRepository.save(PromptDefinitionJpaEntity.fromDomain(definition)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<PromptDefinition> listPromptDefinitions() {
        return promptDefinitionRepository.findAll().stream()
            .map(PromptDefinitionJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public PromptVersion savePromptVersion(PromptVersion version) {
        return promptVersionRepository.save(PromptVersionJpaEntity.fromDomain(version)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PromptVersion> findActivePromptVersion(String promptKey) {
        return promptVersionRepository.findByPromptKeyAndStatus(promptKey, PromptVersionStatus.ACTIVE)
            .map(PromptVersionJpaEntity::toDomain);
    }

    @Override
    @Transactional
    public Optional<PromptVersion> activatePromptVersion(String promptKey, int version) {
        Optional<PromptVersionJpaEntity> target = promptVersionRepository.findByPromptKeyAndVersion(promptKey, version);
        if (target.isEmpty()) {
            return Optional.empty();
        }
        promptVersionRepository.findByPromptKey(promptKey).forEach(entity -> {
            if (entity != target.get()) {
                entity.archive();
                promptVersionRepository.save(entity);
            }
        });
        target.get().activate(Instant.now());
        return Optional.of(promptVersionRepository.save(target.get()).toDomain());
    }

    @Override
    @Transactional
    public EvalSet saveEvalSet(EvalSet evalSet) {
        return evalSetRepository.save(EvalSetJpaEntity.fromDomain(evalSet)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EvalSet> findEvalSet(String evalSetId) {
        return evalSetRepository.findById(evalSetId).map(EvalSetJpaEntity::toDomain);
    }

    @Override
    @Transactional
    public EvalScenario saveEvalScenario(EvalScenario scenario) {
        return evalScenarioRepository.save(EvalScenarioJpaEntity.fromDomain(scenario)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvalScenario> listEvalScenarios(String evalSetId) {
        return evalScenarioRepository.findByEvalSetIdOrderByCreatedAtAscScenarioIdAsc(evalSetId).stream()
            .map(EvalScenarioJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public EvalRun saveEvalRun(EvalRun run) {
        return evalRunRepository.save(EvalRunJpaEntity.fromDomain(run)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EvalRun> findEvalRun(String evalRunId) {
        return evalRunRepository.findById(evalRunId).map(EvalRunJpaEntity::toDomain);
    }

    @Override
    @Transactional
    public EvalResult saveEvalResult(EvalResult result) {
        return evalResultRepository.save(EvalResultJpaEntity.fromDomain(result)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvalResult> listEvalResults(String evalRunId) {
        return evalResultRepository.findByEvalRunIdOrderByCreatedAtAscResultIdAsc(evalRunId).stream()
            .map(EvalResultJpaEntity::toDomain)
            .toList();
    }

    @Override
    public Map<String, Object> evalRunDetail(EvalRun run) {
        return LlmOpsStore.super.evalRunDetail(run);
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(200, limit <= 0 ? 50 : limit));
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static LlmRunStatus statusValue(String status) {
        if (!StringUtils.hasText(status)) {
            return null;
        }
        return LlmRunStatus.valueOf(status.trim().toUpperCase(java.util.Locale.ROOT));
    }
}
