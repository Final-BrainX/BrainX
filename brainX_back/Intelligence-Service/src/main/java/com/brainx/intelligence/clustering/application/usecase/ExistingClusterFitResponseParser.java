package com.brainx.intelligence.clustering.application.usecase;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class ExistingClusterFitResponseParser {

    private final ObjectMapper objectMapper;

    ExistingClusterFitResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    List<ExistingClusterFit> parse(String content, List<String> noteIds, Set<String> clusterIds) {
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (root.has("assignments")) {
                root = root.get("assignments");
            }
            if (!root.isArray()) {
                throw new IllegalArgumentException("Existing cluster fit response must be a JSON array.");
            }
            LinkedHashSet<String> allowedNoteIds = new LinkedHashSet<>(noteIds);
            List<String> assignedNoteIds = new ArrayList<>();
            List<String> issues = new ArrayList<>();
            List<ExistingClusterFit> fits = new ArrayList<>();
            int index = 0;
            for (JsonNode node : root) {
                index++;
                String noteId = text(node, "noteId");
                String clusterId = nullableText(node, "clusterId");
                JsonNode confidenceNode = node.get("confidence");
                if (!StringUtils.hasText(noteId)) {
                    issues.add("assignment[" + index + "] noteId is blank");
                }
                if (clusterId != null && !clusterIds.contains(clusterId)) {
                    issues.add("assignment[" + index + "] has unknown clusterId: " + clusterId);
                }
                if (confidenceNode == null || !confidenceNode.isNumber()) {
                    issues.add("assignment[" + index + "] confidence must be a number");
                }
                double confidence = confidenceNode == null ? -1.0d : confidenceNode.asDouble(-1.0d);
                if (confidence < 0.0d || confidence > 1.0d) {
                    issues.add("assignment[" + index + "] confidence is outside 0..1");
                }
                assignedNoteIds.add(noteId);
                fits.add(new ExistingClusterFit(noteId, clusterId, confidence));
            }
            LinkedHashSet<String> unique = new LinkedHashSet<>(assignedNoteIds);
            LinkedHashSet<String> missing = new LinkedHashSet<>(allowedNoteIds);
            missing.removeAll(unique);
            LinkedHashSet<String> unknown = new LinkedHashSet<>(unique);
            unknown.removeAll(allowedNoteIds);
            if (!missing.isEmpty()) {
                issues.add("missing note IDs: " + missing);
            }
            if (!unknown.isEmpty()) {
                issues.add("unknown note IDs: " + unknown);
            }
            if (unique.size() != assignedNoteIds.size()) {
                issues.add("duplicate note IDs are not allowed");
            }
            if (!issues.isEmpty()) {
                throw new IllegalArgumentException("Existing cluster fit response failed validation: " + String.join("; ", issues));
            }
            return List.copyOf(fits);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Existing cluster fit response was not valid JSON.", exception);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private static String nullableText(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText("").trim();
        return text.isEmpty() ? null : text;
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

    record ExistingClusterFit(String noteId, String clusterId, double confidence) {
    }
}
