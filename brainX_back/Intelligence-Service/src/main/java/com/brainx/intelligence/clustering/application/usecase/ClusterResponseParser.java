package com.brainx.intelligence.clustering.application.usecase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;

import org.springframework.util.StringUtils;

import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

final class ClusterResponseParser {

    private final ObjectMapper objectMapper;

    ClusterResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    List<Cluster> parseClusters(
        String clusterJobId,
        String content,
        List<KnowledgeAnalysisNote> notes,
        int maxClusters
    ) {
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (root.has("clusters")) {
                root = root.get("clusters");
            }
            if (!root.isArray()) {
                throw new IllegalArgumentException("Cluster response must be a JSON array.");
            }
            LinkedHashSet<String> allowedNoteIds = new LinkedHashSet<>();
            notes.forEach(note -> allowedNoteIds.add(note.noteId()));
            List<Cluster> clusters = new ArrayList<>();
            for (JsonNode node : root) {
                if (clusters.size() >= maxClusters) {
                    break;
                }
                String title = text(node, "title");
                if (!StringUtils.hasText(title)) {
                    continue;
                }
                List<String> noteIds = stringList(node.path("noteIds")).stream()
                    .filter(allowedNoteIds::contains)
                    .toList();
                if (noteIds.isEmpty()) {
                    continue;
                }
                int ordinal = clusters.size() + 1;
                clusters.add(new Cluster(
                    clusterId(clusterJobId, ordinal, title),
                    title,
                    text(node, "summary"),
                    noteIds,
                    stringList(node.path("keywords")),
                    doubleValue(node.path("confidence"), 0.0d)
                ));
            }
            if (clusters.isEmpty()) {
                throw new IllegalArgumentException("Cluster response did not contain valid clusters.");
            }
            return clusters;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Cluster response was not valid JSON.", exception);
        }
    }

    private static double doubleValue(JsonNode node, double defaultValue) {
        if (node != null && node.isNumber()) {
            return node.asDouble();
        }
        if (node != null && node.isTextual()) {
            try {
                return Double.parseDouble(node.asText());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
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

    private static String clusterId(String clusterJobId, int ordinal, String title) {
        return "cluster-" + sha256(clusterJobId + ":" + ordinal + ":" + title).substring(0, 16);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }
}
