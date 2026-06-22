package com.brainx.intelligence.exploration.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public record SemanticSearchQuery(
    String userId,
    String documentGroupId,
    String query,
    Map<String, Object> filters,
    int limit,
    List<String> hybridWithClientKeywordIds
) {

    public static final int DEFAULT_LIMIT = 10;
    public static final int MAX_LIMIT = 50;

    public SemanticSearchQuery(
        String userId,
        String query,
        Map<String, Object> filters,
        int limit,
        List<String> hybridWithClientKeywordIds
    ) {
        this(userId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, query, filters, limit, hybridWithClientKeywordIds);
    }

    public SemanticSearchQuery {
        userId = ExplorationValidation.requireText(userId, "userId");
        documentGroupId = DocumentGroups.normalize(documentGroupId);
        query = ExplorationValidation.requireText(query, "query");
        filters = immutableMap(filters);
        limit = normalizeLimit(limit);
        hybridWithClientKeywordIds = immutableTextList(hybridWithClientKeywordIds);
    }

    public static int normalizeLimit(Integer value) {
        if (value == null || value <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(value, MAX_LIMIT);
    }

    private static int normalizeLimit(int value) {
        return normalizeLimit(Integer.valueOf(value));
    }

    private static Map<String, Object> immutableMap(Map<String, Object> values) {
        if (values == null || values.isEmpty()) {
            return Map.of();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(values));
    }

    private static List<String> immutableTextList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> normalized = new ArrayList<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                normalized.add(value);
            }
        }
        return List.copyOf(normalized);
    }
}
