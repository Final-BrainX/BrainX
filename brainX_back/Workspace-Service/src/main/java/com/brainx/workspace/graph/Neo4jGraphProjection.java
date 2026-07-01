package com.brainx.workspace.graph;

import com.brainx.workspace.entity.Note;
import com.brainx.workspace.entity.NoteLink;
import com.brainx.workspace.event.WorkspaceEvent;
import com.brainx.workspace.repository.NoteLinkRepository;
import com.brainx.workspace.repository.NoteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.neo4j.driver.Driver;
import org.neo4j.driver.SessionConfig;
import org.neo4j.driver.summary.ResultSummary;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Component
@RequiredArgsConstructor
public class Neo4jGraphProjection {
    private final ObjectProvider<Driver> driverProvider;
    private final NoteRepository noteRepository;
    private final NoteLinkRepository noteLinkRepository;

    @Value("${brainx.graph.neo4j.enabled:true}")
    private boolean enabled;

    @Value("${brainx.graph.neo4j.backfill-on-startup:true}")
    private boolean backfillOnStartup;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional(readOnly = true)
    public void initializeSchema() {
        if (!enabled) {
            return;
        }
        Driver driver = driverProvider.getIfAvailable();
        if (driver == null) {
            return;
        }

        try (var session = driver.session(SessionConfig.defaultConfig())) {
            session.executeWrite(tx -> tx.run("""
                    CREATE CONSTRAINT brainx_note_identity IF NOT EXISTS
                    FOR (n:Note) REQUIRE (n.userId, n.noteId) IS UNIQUE
                    """).consume());
            session.executeWrite(tx -> tx.run("""
                    CREATE INDEX brainx_note_updated IF NOT EXISTS
                    FOR (n:Note) ON (n.userId, n.updatedAt)
                    """).consume());
            session.executeWrite(tx -> tx.run("""
                    CREATE INDEX brainx_note_folder IF NOT EXISTS
                    FOR (n:Note) ON (n.userId, n.folderId)
                    """).consume());
            session.executeWrite(tx -> tx.run("""
                    CREATE INDEX brainx_link_identity IF NOT EXISTS
                    FOR ()-[r:LINKED]-() ON (r.linkId)
                    """).consume());
            if (backfillOnStartup) {
                backfillExistingLedger(session);
            }
        } catch (Exception exception) {
            log.warn("Neo4j graph projection schema initialization failed: {}", exception.getMessage());
        }
    }

    private void backfillExistingLedger(org.neo4j.driver.Session session) {
        log.info("[Neo4jGraphProjection] Starting startup backfill from PostgreSQL SSOT...");
        List<Note> notes = noteRepository.findAll();
        List<NoteLink> links = noteLinkRepository.findAll();

        log.info("[Neo4jGraphProjection] PostgreSQL Note count: {}, NoteLink count: {}", notes.size(), links.size());

        int noteSuccessCount = 0;
        int linkSuccessCount = 0;
        List<String> failedNoteIds = new ArrayList<>();
        List<String> failedLinkIds = new ArrayList<>();

        for (Note note : notes) {
            try {
                session.executeWrite(tx -> tx.run("""
                        MERGE (n:Note {userId: $userId, noteId: $noteId})
                        SET n.workspaceId = $workspaceId,
                            n.title = $title,
                            n.createdAt = $createdAt,
                            n.updatedAt = $updatedAt,
                            n.deleted = $deleted
                        """, params(
                        "userId", note.getUserId(),
                        "workspaceId", note.getUserId(),
                        "noteId", note.getNoteId(),
                        "title", note.getTitle(),
                        "createdAt", iso(note.getCreatedAt()),
                        "updatedAt", iso(note.getUpdatedAt()),
                        "deleted", note.isDeleted()
                )).consume());
                noteSuccessCount++;
            } catch (Exception e) {
                log.error("[Neo4jGraphProjection] Failed to sync Note node backfill: noteId={}", note.getNoteId(), e);
                failedNoteIds.add(note.getNoteId());
            }
        }

        for (NoteLink link : links) {
            try {
                session.executeWrite(tx -> tx.run("""
                        MERGE (source:Note {userId: $userId, noteId: $sourceNoteId})
                        ON CREATE SET source.deleted = false
                        MERGE (target:Note {userId: $userId, noteId: $targetNoteId})
                        ON CREATE SET target.deleted = false
                        MERGE (source)-[r:LINKED {linkId: $linkId}]->(target)
                        SET r.sourceNoteId = $sourceNoteId,
                            r.targetNoteId = $targetNoteId,
                            r.createdAt = $createdAt
                        """, params(
                        "userId", link.getUserId(),
                        "sourceNoteId", link.getSourceNoteId(),
                        "targetNoteId", link.getTargetNoteId(),
                        "linkId", link.getLinkId(),
                        "createdAt", iso(link.getCreatedAt())
                )).consume());
                linkSuccessCount++;
            } catch (Exception e) {
                log.error("[Neo4jGraphProjection] Failed to sync NoteLink relationship backfill: linkId={}", link.getLinkId(), e);
                failedLinkIds.add(link.getLinkId());
            }
        }

        log.info("[Neo4jGraphProjection] Backfill result - Node Success: {}, Relationship Success: {}", noteSuccessCount, linkSuccessCount);
        if (!failedNoteIds.isEmpty()) {
            log.warn("[Neo4jGraphProjection] Failed Note IDs: {}", failedNoteIds);
        }
        if (!failedLinkIds.isEmpty()) {
            log.warn("[Neo4jGraphProjection] Failed NoteLink IDs: {}", failedLinkIds);
        }

        if (!notes.isEmpty() && noteSuccessCount == 0) {
            throw new IllegalStateException("[Neo4jGraphProjection] PostgreSQL notes exist but Neo4j Node creation success count is 0!");
        }
        if (!links.isEmpty() && linkSuccessCount == 0) {
            throw new IllegalStateException("[Neo4jGraphProjection] PostgreSQL links exist but Neo4j LINKED relationship creation success count is 0!");
        }
    }

    @EventListener
    @Transactional(readOnly = true)
    public void project(WorkspaceEvent event) {
        if (!enabled) {
            return;
        }
        Driver driver = driverProvider.getIfAvailable();
        if (driver == null) {
            return;
        }

        try (var session = driver.session(SessionConfig.defaultConfig())) {
            switch (event.eventType()) {
                case "NoteCreated" -> projectNoteCreated(session, event);
                case "NoteContentSaved" -> projectNoteContentSaved(session, event);
                case "NoteMetadataChanged", "NoteTagsChanged" -> projectNoteMetadataChanged(session, event);
                case "NoteTrashed", "NoteDeleted" -> projectNoteDeleted(session, event);
                case "NoteLinkCreated" -> projectNoteLinkCreated(session, event);
                case "NoteLinkDeleted" -> projectNoteLinkDeleted(session, event);
                default -> {
                    // This projection only cares about note graph events.
                }
            }
        } catch (Exception exception) {
            log.warn("Neo4j graph projection failed for eventType={} eventId={}: {}",
                    event.eventType(), event.eventId(), exception.getMessage());
        }
    }

    private void projectNoteCreated(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String noteId = requiredString(payload, "noteId", null);
        String title = string(payload, "title");
        session.executeWrite(tx -> tx.run("""
                MERGE (n:Note {userId: $userId, noteId: $noteId})
                SET n.workspaceId = $workspaceId,
                    n.title = $title,
                    n.createdAt = $occurredAt,
                    n.updatedAt = $occurredAt,
                    n.deleted = false
                """, params(
                "userId", userId,
                "workspaceId", userId,
                "noteId", noteId,
                "title", title,
                "occurredAt", iso(event.occurredAt())
        )).consume());
    }

    private void projectNoteContentSaved(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String noteId = requiredString(payload, "noteId", null);
        session.executeWrite(tx -> tx.run("""
                MERGE (n:Note {userId: $userId, noteId: $noteId})
                SET n.updatedAt = $savedAt,
                    n.deleted = false
                """, params(
                "userId", userId,
                "noteId", noteId,
                "savedAt", instantString(payload.get("savedAt"), event.occurredAt())
        )).consume());
    }

    private void projectNoteMetadataChanged(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String noteId = requiredString(payload, "noteId", null);
        String title = nullableString(payload, "title");
        session.executeWrite(tx -> tx.run("""
                MERGE (n:Note {userId: $userId, noteId: $noteId})
                SET n.title = coalesce($title, n.title),
                    n.updatedAt = $occurredAt,
                    n.deleted = false
                """, params(
                "userId", userId,
                "noteId", noteId,
                "title", title,
                "occurredAt", iso(event.occurredAt())
        )).consume());
    }

    private void projectNoteDeleted(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String noteId = requiredString(payload, "noteId", null);
        session.executeWrite(tx -> tx.run("""
                MATCH (n:Note {userId: $userId, noteId: $noteId})
                DETACH DELETE n
                """, params(
                "userId", userId,
                "noteId", noteId
        )).consume());
    }

    private void projectNoteLinkCreated(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String sourceNoteId = requiredString(payload, "sourceNoteId", null);
        String targetNoteId = requiredString(payload, "targetNoteId", null);
        String linkId = requiredString(payload, "linkId", null);
        session.executeWrite(tx -> tx.run("""
                MERGE (source:Note {userId: $userId, noteId: $sourceNoteId})
                ON CREATE SET source.deleted = false
                MERGE (target:Note {userId: $userId, noteId: $targetNoteId})
                ON CREATE SET target.deleted = false
                MERGE (source)-[r:LINKED {linkId: $linkId}]->(target)
                SET r.sourceNoteId = $sourceNoteId,
                    r.targetNoteId = $targetNoteId,
                    r.createdAt = $occurredAt
                """, params(
                "userId", userId,
                "sourceNoteId", sourceNoteId,
                "targetNoteId", targetNoteId,
                "linkId", linkId,
                "occurredAt", iso(event.occurredAt())
        )).consume());
    }

    private void projectNoteLinkDeleted(org.neo4j.driver.Session session, WorkspaceEvent event) {
        Map<String, Object> payload = event.payload();
        String userId = requiredString(payload, "userId", event.userId());
        String sourceNoteId = requiredString(payload, "sourceNoteId", null);
        String targetNoteId = requiredString(payload, "targetNoteId", null);
        String linkId = requiredString(payload, "linkId", null);
        session.executeWrite(tx -> tx.run("""
                MATCH (:Note {userId: $userId, noteId: $sourceNoteId})-[r:LINKED {linkId: $linkId}]->(:Note {userId: $userId, noteId: $targetNoteId})
                DELETE r
                """, params(
                "userId", userId,
                "sourceNoteId", sourceNoteId,
                "targetNoteId", targetNoteId,
                "linkId", linkId
        )).consume());
    }

    public Map<String, Object> syncAll() {
        log.info("[Neo4jGraphProjection] Manual syncAll requested.");
        Driver driver = driverProvider.getIfAvailable();
        if (!enabled || driver == null) {
            log.warn("[Neo4jGraphProjection] Neo4j is disabled or driver is unavailable.");
            return Map.of("notes", 0, "relationships", 0, "status", "DISABLED");
        }

        try (var session = driver.session(SessionConfig.defaultConfig())) {
            // ① Neo4j의 모든 Note 및 LINKED 삭제
            log.info("[Neo4jGraphProjection] Cleaning up all existing Neo4j graph nodes and links...");
            session.executeWrite(tx -> tx.run("MATCH (n:Note) DETACH DELETE n").consume());

            // ② PostgreSQL Note 전체 조회 & ③ PostgreSQL NoteLink 전체 조회
            List<Note> notes = noteRepository.findAll();
            List<NoteLink> links = noteLinkRepository.findAll();

            log.info("[Neo4jGraphProjection] PostgreSQL data loaded - Note count: {}, NoteLink count: {}", notes.size(), links.size());

            int noteSuccessCount = 0;
            int linkSuccessCount = 0;
            List<String> failedNoteIds = new ArrayList<>();
            List<String> failedLinkIds = new ArrayList<>();

            // ④ 모든 Note 생성
            for (Note note : notes) {
                try {
                    session.executeWrite(tx -> tx.run("""
                            MERGE (n:Note {userId: $userId, noteId: $noteId})
                            SET n.workspaceId = $workspaceId,
                                n.title = $title,
                                n.createdAt = $createdAt,
                                n.updatedAt = $updatedAt,
                                n.deleted = $deleted
                            """, params(
                            "userId", note.getUserId(),
                            "workspaceId", note.getUserId(),
                            "noteId", note.getNoteId(),
                            "title", note.getTitle(),
                            "createdAt", iso(note.getCreatedAt()),
                            "updatedAt", iso(note.getUpdatedAt()),
                            "deleted", note.isDeleted()
                    )).consume());
                    noteSuccessCount++;
                } catch (Exception e) {
                    log.error("[Neo4jGraphProjection] Failed to create Note node in manual syncAll: noteId={}", note.getNoteId(), e);
                    failedNoteIds.add(note.getNoteId());
                }
            }

            // ⑤ 모든 LINKED 생성
            for (NoteLink link : links) {
                try {
                    session.executeWrite(tx -> tx.run("""
                            MERGE (source:Note {userId: $userId, noteId: $sourceNoteId})
                            ON CREATE SET source.deleted = false
                            MERGE (target:Note {userId: $userId, noteId: $targetNoteId})
                            ON CREATE SET target.deleted = false
                            MERGE (source)-[r:LINKED {linkId: $linkId}]->(target)
                            SET r.sourceNoteId = $sourceNoteId,
                                r.targetNoteId = $targetNoteId,
                                r.createdAt = $createdAt
                            """, params(
                            "userId", link.getUserId(),
                            "sourceNoteId", link.getSourceNoteId(),
                            "targetNoteId", link.getTargetNoteId(),
                            "linkId", link.getLinkId(),
                            "createdAt", iso(link.getCreatedAt())
                    )).consume());
                    linkSuccessCount++;
                } catch (Exception e) {
                    log.error("[Neo4jGraphProjection] Failed to create NoteLink relationship in manual syncAll: linkId={}", link.getLinkId(), e);
                    failedLinkIds.add(link.getLinkId());
                }
            }

            log.info("[Neo4jGraphProjection] Manual syncAll execution finished.");
            log.info("[Neo4jGraphProjection] Node success: {}/{}, Link success: {}/{}", noteSuccessCount, notes.size(), linkSuccessCount, links.size());
            if (!failedNoteIds.isEmpty()) {
                log.warn("[Neo4jGraphProjection] Failed Note IDs: {}", failedNoteIds);
            }
            if (!failedLinkIds.isEmpty()) {
                log.warn("[Neo4jGraphProjection] Failed NoteLink IDs: {}", failedLinkIds);
            }

            // ⑧ 실패 처리
            if (!notes.isEmpty() && noteSuccessCount == 0) {
                throw new IllegalStateException("[Neo4jGraphProjection] PostgreSQL notes exist but Neo4j Node creation success count is 0!");
            }
            if (!links.isEmpty() && linkSuccessCount == 0) {
                throw new IllegalStateException("[Neo4jGraphProjection] PostgreSQL links exist but Neo4j LINKED relationship creation success count is 0!");
            }

            return Map.of(
                    "notes", noteSuccessCount,
                    "relationships", linkSuccessCount,
                    "status", "SUCCESS"
            );
        }
    }

    public void upsertManualLink(String userId, String sourceNoteId, String targetNoteId, String linkId, Instant createdAt) {
        Driver driver = driverProvider.getIfAvailable();
        if (!enabled) {
            log.info("[Neo4jGraphProjection] Neo4j is disabled by configuration (enabled=false). Skip upsertManualLink.");
            return;
        }
        if (driver == null) {
            log.warn("[Neo4jGraphProjection] Neo4j Driver is null. Skip upsertManualLink.");
            return;
        }

        String cypher = """
                MERGE (source:Note {userId: $userId, noteId: $sourceNoteId})
                ON CREATE SET source.deleted = false
                MERGE (target:Note {userId: $userId, noteId: $targetNoteId})
                ON CREATE SET target.deleted = false
                MERGE (source)-[r:LINKED {linkId: $linkId}]->(target)
                SET r.sourceNoteId = $sourceNoteId,
                    r.targetNoteId = $targetNoteId,
                    r.createdAt = $createdAt
                """;

        Map<String, Object> queryParams = params(
                "userId", userId,
                "sourceNoteId", sourceNoteId,
                "targetNoteId", targetNoteId,
                "linkId", linkId,
                "createdAt", iso(createdAt)
        );

        log.info("[Neo4jGraphProjection] Executing upsertManualLink Cypher Query:\n{}", cypher);
        log.info("[Neo4jGraphProjection] Parameters: {}", queryParams);

        try (var session = driver.session(SessionConfig.defaultConfig())) {
            log.info("[Neo4jGraphProjection] Neo4j Session opened. Executing write transaction...");
            session.executeWrite(tx -> {
                log.info("[Neo4jGraphProjection] Inside session.executeWrite transaction running query...");
                var result = tx.run(cypher, queryParams);
                var summary = result.consume();
                log.info("[Neo4jGraphProjection] Neo4j Query Executed. Created relationships: {}, Nodes created: {}",
                        summary.counters().relationshipsCreated(), summary.counters().nodesCreated());
                return null;
            });
            log.info("[Neo4jGraphProjection] Neo4j transaction completed successfully.");
        } catch (Exception e) {
            log.error("[Neo4jGraphProjection] Exception occurred during upsertManualLink in Neo4j!", e);
            throw e;
        }
    }

    public void deleteManualLink(String userId, String sourceNoteId, String targetNoteId, String linkId) {
        Driver driver = driverProvider.getIfAvailable();
        if (!enabled || driver == null) {
            return;
        }
        try (var session = driver.session(SessionConfig.defaultConfig())) {
            session.executeWrite(tx -> tx.run("""
                    MATCH (:Note {userId: $userId, noteId: $sourceNoteId})-[r:LINKED {linkId: $linkId}]->(:Note {userId: $userId, noteId: $targetNoteId})
                    DELETE r
                    """, params(
                    "userId", userId,
                    "sourceNoteId", sourceNoteId,
                    "targetNoteId", targetNoteId,
                    "linkId", linkId
            )).consume());
        }
    }

    private String requiredString(Map<String, Object> payload, String key, String fallback) {
        String value = nullableString(payload, key);
        if (value != null) {
            return value;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        throw new IllegalArgumentException("Missing required graph projection field: " + key);
    }

    private Map<String, Object> params(Object... keyValues) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < keyValues.length; index += 2) {
            result.put((String) keyValues[index], keyValues[index + 1]);
        }
        return result;
    }

    private String nullableString(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    private String string(Map<String, Object> payload, String key) {
        String value = nullableString(payload, key);
        return value == null ? "" : value;
    }

    private String stringOrDefault(Map<String, Object> payload, String key, String fallback) {
        String value = nullableString(payload, key);
        return value == null ? fallback : value;
    }

    private int intValue(Map<String, Object> payload, String key) {
        Integer value = nullableInt(payload, key);
        return value == null ? 0 : value;
    }

    private Integer nullableInt(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return null;
    }

    private List<String> stringList(Map<String, Object> payload, String key) {
        List<String> value = nullableStringList(payload, key);
        return value == null ? List.of() : value;
    }

    private List<String> nullableStringList(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (!(value instanceof List<?> list)) {
            return null;
        }
        return list.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
    }

    private String instantString(Object value, Instant fallback) {
        if (value instanceof Instant instant) {
            return iso(instant);
        }
        if (value instanceof String text && !text.isBlank()) {
            return text;
        }
        return iso(fallback);
    }

    private String iso(Instant instant) {
        return instant == null ? Instant.now().toString() : instant.toString();
    }
}
