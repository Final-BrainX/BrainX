package com.brainx.workspace.graph;

import com.brainx.workspace.dto.WorkspaceDtos.GraphData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.neo4j.driver.Driver;
import org.neo4j.driver.SessionConfig;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class Neo4jGraphQueryService {
    private final ObjectProvider<Driver> driverProvider;

    @Value("${brainx.graph.neo4j.enabled:true}")
    private boolean enabled;

    public Optional<GraphData> findGraph(String userId, String folderId, String tag, Instant since, Instant until) {
        if (!enabled) {
            return Optional.empty();
        }
        Driver driver = driverProvider.getIfAvailable();
        if (driver == null) {
            return Optional.empty();
        }

        try (var session = driver.session(SessionConfig.defaultConfig())) {
            Map<String, Object> params = mapOf(
                    "userId", userId,
                    "folderId", folderId,
                    "tag", tag,
                    "since", since == null ? null : since.toString(),
                    "until", until == null ? null : until.toString()
            );
            List<Map<String, Object>> nodes = session.executeRead(tx -> tx.run("""
                    MATCH (n:Note {userId: $userId})
                    WHERE coalesce(n.deleted, false) = false
                      AND ($folderId IS NULL OR n.folderId = $folderId)
                      AND ($tag IS NULL OR $tag IN coalesce(n.tags, []))
                      AND ($since IS NULL OR coalesce(n.updatedAt, '') >= $since)
                      AND ($until IS NULL OR coalesce(n.updatedAt, '') < $until)
                    RETURN n.noteId AS noteId,
                           coalesce(n.title, '') AS title,
                           coalesce(n.tags, []) AS tags,
                           n.documentGroupId AS documentGroupId,
                           n.folderId AS folderId,
                           n.summary AS summary,
                           n.createdAt AS createdAt,
                           n.updatedAt AS updatedAt,
                           n.lastViewedAt AS lastViewedAt
                    ORDER BY n.updatedAt DESC
                    """, params).list(record -> mapOf(
                    "id", record.get("noteId").asString(),
                    "noteId", record.get("noteId").asString(),
                    "title", record.get("title").asString(),
                    "tags", record.get("tags").asList(value -> value.asString()),
                    "documentGroupId", record.get("documentGroupId").isNull() ? null : record.get("documentGroupId").asString(),
                    "folderId", record.get("folderId").isNull() ? null : record.get("folderId").asString(),
                    "summary", record.get("summary").isNull() ? null : record.get("summary").asString(),
                    "createdAt", record.get("createdAt").isNull() ? null : record.get("createdAt").asString(),
                    "updatedAt", record.get("updatedAt").isNull() ? null : record.get("updatedAt").asString(),
                    "lastViewedAt", record.get("lastViewedAt").isNull() ? null : record.get("lastViewedAt").asString()
            )));

            List<String> noteIds = nodes.stream()
                    .map(node -> (String) node.get("noteId"))
                    .toList();
            Map<String, Object> edgeParams = mapOf(
                    "userId", userId,
                    "noteIds", noteIds
            );
            List<Map<String, Object>> edges = noteIds.isEmpty() ? List.of() : session.executeRead(tx -> tx.run("""
                    MATCH (source:Note {userId: $userId})-[r:LINKED]->(target:Note {userId: $userId})
                    WHERE source.noteId IN $noteIds
                      AND target.noteId IN $noteIds
                    RETURN coalesce(r.linkId, source.noteId + '::' + target.noteId) AS linkId,
                           source.noteId AS sourceNoteId,
                           target.noteId AS targetNoteId,
                           coalesce(r.linkType, r.type, 'MANUAL') AS type,
                           r.weight AS weight,
                           r.reason AS reason,
                           r.anchorText AS anchorText,
                           r.headingAnchor AS headingAnchor
                    """, edgeParams).list(record -> mapOf(
                    "id", record.get("linkId").asString(),
                    "linkId", record.get("linkId").asString(),
                    "source", record.get("sourceNoteId").asString(),
                    "target", record.get("targetNoteId").asString(),
                    "type", record.get("type").asString(),
                    "weight", record.get("weight").isNull() ? null : record.get("weight").asDouble(),
                    "reason", record.get("reason").isNull() ? null : record.get("reason").asString(),
                    "metadata", mapOf(
                            "anchorText", record.get("anchorText").isNull() ? null : record.get("anchorText").asString(),
                            "headingAnchor", record.get("headingAnchor").isNull() ? null : record.get("headingAnchor").asString()
                    )
            )));

            return Optional.of(new GraphData(
                    nodes,
                    edges,
                    Map.of("noteCount", nodes.size(), "edgeCount", edges.size(), "source", "neo4j"),
                    null
            ));
        } catch (Exception exception) {
            log.warn("Neo4j graph query failed, falling back to Workspace ledger: {}", exception.getMessage());
            return Optional.empty();
        }
    }

    private Map<String, Object> mapOf(Object... keyValues) {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        for (int index = 0; index < keyValues.length; index += 2) {
            result.put((String) keyValues[index], keyValues[index + 1]);
        }
        return result;
    }
}
