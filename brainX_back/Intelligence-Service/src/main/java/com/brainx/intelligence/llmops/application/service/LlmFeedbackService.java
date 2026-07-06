package com.brainx.intelligence.llmops.application.service;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;

@Service
public class LlmFeedbackService {

    private final LlmOpsStore store;

    public LlmFeedbackService(LlmOpsStore store) {
        this.store = store;
    }

    public LlmFeedback submitFeedback(String userId, String llmRunId, LlmFeedbackRating rating, String reasonCode, String comment) {
        String normalizedUserId = requireText(userId, "userId");
        String normalizedRunId = requireText(llmRunId, "llmRunId");
        if (rating == null) {
            throw new IllegalArgumentException("rating must not be null.");
        }
        var run = store.findRunById(normalizedRunId)
            .orElseThrow(() -> new LlmOpsNotFoundException("LLM run not found."));
        if (!normalizedUserId.equals(run.userId())) {
            throw new LlmOpsNotFoundException("LLM run not found.");
        }
        return store.upsertFeedback(new LlmFeedback(
            UUID.randomUUID().toString(),
            normalizedUserId,
            normalizedRunId,
            rating,
            normalize(reasonCode),
            normalize(comment),
            Instant.now(),
            Instant.now()
        ));
    }

    public List<LlmFeedback> listFeedback(String userId, String llmRunId, int limit) {
        return store.listFeedback(normalize(userId), normalize(llmRunId), normalizeLimit(limit));
    }

    public Map<String, LlmFeedbackRating> feedbackRatingsByRunId(String userId, Collection<String> llmRunIds) {
        String normalizedUserId = requireText(userId, "userId");
        List<String> normalizedRunIds = llmRunIds == null ? List.of() : llmRunIds.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .distinct()
            .toList();
        if (normalizedRunIds.isEmpty()) {
            return Map.of();
        }
        return store.listFeedbackByRunIds(normalizedUserId, normalizedRunIds).stream()
            .collect(Collectors.toMap(
                LlmFeedback::llmRunId,
                LlmFeedback::rating,
                (left, right) -> left,
                LinkedHashMap::new
            ));
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(200, limit <= 0 ? 50 : limit));
    }

    private static String requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
