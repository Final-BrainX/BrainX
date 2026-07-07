package com.brainx.intelligence.autolink.application.usecase;

import java.util.ArrayList;
import java.util.List;

import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class AutoLinkJsonParser {

    private final ObjectMapper objectMapper;

    AutoLinkJsonParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    List<AutoLinkLlmSuggestion> parseLlmSuggestions(String content) {
        if (!StringUtils.hasText(content)) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            JsonNode suggestionsNode = root.isArray() ? root : root.get("suggestions");
            if (suggestionsNode == null || !suggestionsNode.isArray()) {
                return List.of();
            }
            List<AutoLinkLlmSuggestion> suggestions = new ArrayList<>();
            for (JsonNode node : suggestionsNode) {
                String anchorText = text(node, "anchorText");
                String targetNoteId = text(node, "targetNoteId");
                if (!StringUtils.hasText(anchorText) || !StringUtils.hasText(targetNoteId)) {
                    continue;
                }
                suggestions.add(new AutoLinkLlmSuggestion(
                    anchorText,
                    targetNoteId,
                    text(node, "reason"),
                    confidence(node.get("confidence"))
                ));
            }
            return suggestions;
        } catch (Exception exception) {
            return List.of();
        }
    }

    AutoLinkRelationVerification parseRelationVerification(String content) {
        if (!StringUtils.hasText(content)) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            String relationType = text(root, "relationType");
            if (!StringUtils.hasText(relationType)) {
                return null;
            }
            return new AutoLinkRelationVerification(
                relationType,
                confidence(root.get("confidence")),
                text(root, "reason")
            );
        } catch (Exception exception) {
            return null;
        }
    }

    private static String jsonPayload(String content) {
        String trimmed = content.trim();
        int arrayStart = trimmed.indexOf('[');
        int arrayEnd = trimmed.lastIndexOf(']');
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
            return trimmed.substring(arrayStart, arrayEnd + 1);
        }
        int objectStart = trimmed.indexOf('{');
        int objectEnd = trimmed.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
            return trimmed.substring(objectStart, objectEnd + 1);
        }
        return trimmed;
    }

    private static String text(JsonNode node, String fieldName) {
        JsonNode value = node == null ? null : node.get(fieldName);
        if (value == null || value.isNull()) {
            return "";
        }
        String text = value.asText("");
        return text == null ? "" : text.trim();
    }

    private static double confidence(JsonNode node) {
        if (node == null || !node.isNumber()) {
            return 0.0d;
        }
        return Math.max(0.0d, Math.min(1.0d, node.asDouble()));
    }
}
