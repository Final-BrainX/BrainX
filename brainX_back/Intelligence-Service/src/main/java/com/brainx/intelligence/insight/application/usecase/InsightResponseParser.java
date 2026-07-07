package com.brainx.intelligence.insight.application.usecase;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

import org.springframework.util.StringUtils;

import com.brainx.intelligence.insight.domain.InsightRecommendation;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class InsightResponseParser {

    private final ObjectMapper objectMapper;

    InsightResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    ParsedInsight parseInsight(
        String content,
        List<KnowledgeAnalysisNote> notes,
        boolean includeLearningRecommendations,
        int maxRecommendations
    ) {
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (!root.isObject()) {
                throw new IllegalArgumentException("Insight response must be a JSON object.");
            }
            LinkedHashSet<String> allowedNoteIds = new LinkedHashSet<>();
            notes.forEach(note -> allowedNoteIds.add(note.noteId()));
            List<InsightRecommendation> recommendations = new ArrayList<>();
            JsonNode recommendationNodes = root.path("recommendations");
            if (recommendationNodes.isArray()) {
                for (JsonNode node : recommendationNodes) {
                    if (recommendations.size() >= maxRecommendations) {
                        break;
                    }
                    InsightRecommendation recommendation = recommendation(node, allowedNoteIds);
                    if (!StringUtils.hasText(recommendation.title())) {
                        continue;
                    }
                    if (!includeLearningRecommendations && learningRecommendation(recommendation.type())) {
                        continue;
                    }
                    recommendations.add(recommendation);
                }
            }
            String summary = text(root, "summary");
            List<String> knowledgeGaps = stringList(root.path("knowledgeGaps"));
            if (!StringUtils.hasText(summary) && knowledgeGaps.isEmpty() && recommendations.isEmpty()) {
                throw new IllegalArgumentException("Insight response did not contain usable data.");
            }
            return new ParsedInsight(summary, knowledgeGaps, recommendations);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Insight response was not valid JSON.", exception);
        }
    }

    private static InsightRecommendation recommendation(JsonNode node, LinkedHashSet<String> allowedNoteIds) {
        List<String> noteIds = stringList(node.path("noteIds")).stream()
            .filter(allowedNoteIds::contains)
            .toList();
        return new InsightRecommendation(
            text(node, "type"),
            text(node, "title"),
            text(node, "reason"),
            noteIds,
            text(node, "priority")
        );
    }

    private static boolean learningRecommendation(String type) {
        String normalized = type == null ? "" : type.trim().toUpperCase();
        return normalized.contains("LEARNING") || normalized.contains("STUDY");
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return "";
        }
        String text = value.asText("");
        return text == null ? "" : text.trim();
    }

    private static List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.asText("");
            if (StringUtils.hasText(value)) {
                values.add(value.trim());
            }
        }
        return values.stream().distinct().toList();
    }

    private static String jsonPayload(String content) {
        if (content == null) {
            return "";
        }
        String text = content.trim();
        if (text.startsWith("```")) {
            int firstLineEnd = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstLineEnd >= 0 && lastFence > firstLineEnd) {
                return text.substring(firstLineEnd + 1, lastFence).trim();
            }
        }
        return text;
    }
}
