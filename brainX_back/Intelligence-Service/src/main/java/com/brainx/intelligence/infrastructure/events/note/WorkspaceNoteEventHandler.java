package com.brainx.intelligence.infrastructure.events.note;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventHandler;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingContext;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;
import com.brainx.intelligence.infrastructure.workspace.WorkspaceNoteAdapterException;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class WorkspaceNoteEventHandler implements BrainxEventHandler {

    private static final Set<String> EVENT_TYPES = Set.of(
        "NoteCreated",
        "NoteContentSaved",
        "NoteMetadataChanged",
        "NoteTagsChanged",
        "NoteTrashed",
        "NoteDeleted",
        "NotesMoved"
    );
    private final ObjectMapper objectMapper;
    private final NoteProjectionStore noteProjectionStore;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteSummaryPort noteSummaryPort;
    private final MarkdownNoteChunker noteChunker;

    public WorkspaceNoteEventHandler(
        ObjectMapper objectMapper,
        NoteProjectionStore noteProjectionStore,
        WorkspaceNotePort workspaceNotePort,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteSummaryPort noteSummaryPort,
        MarkdownNoteChunker noteChunker
    ) {
        this.objectMapper = objectMapper;
        this.noteProjectionStore = noteProjectionStore;
        this.workspaceNotePort = workspaceNotePort;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteSummaryPort = noteSummaryPort;
        this.noteChunker = noteChunker;
    }

    @Override
    public Set<String> eventTypes() {
        return EVENT_TYPES;
    }

    @Override
    public void handle(EventProcessingContext context) {
        switch (context.eventType()) {
            case "NoteCreated" -> handleNoteCreated(context);
            case "NoteContentSaved" -> handleNoteContentSaved(context);
            case "NoteMetadataChanged" -> handleNoteMetadataChanged(context);
            case "NoteTagsChanged" -> handleNoteTagsChanged(context);
            case "NoteTrashed" -> handleNoteTrashed(context);
            case "NoteDeleted" -> handleNoteDeleted(context);
            case "NotesMoved" -> handleNotesMoved(context);
            default -> throw EventProcessingException.nonRetryable(
                "UNSUPPORTED_EVENT_TYPE",
                "Unsupported workspace note event type."
            );
        }
    }

    private void handleNoteCreated(EventProcessingContext context) {
        NoteCreatedPayload payload = readPayload(context, NoteCreatedPayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        requireText(payload.title(), "title");
        int version = requireVersion(payload.version());

        var existing = noteProjectionStore.findByUserIdAndNoteId(payload.userId(), payload.noteId());
        if (existing.isPresent() && existing.get().stale(version)) {
            return;
        }

        NoteProjection projection = NoteProjection.created(
            payload.userId(),
            payload.noteId(),
            payload.title(),
            payload.folderId(),
            payload.tags(),
            version,
            context.eventId(),
            context.envelope().occurredAt()
        );
        noteProjectionStore.save(projection);
        boolean indexedFromSnapshot = tryIndexFromSnapshot(projection, version, null, context.eventId(), false);
        if (!indexedFromSnapshot) {
            noteSearchIndexPort.replaceNoteChunks(
                payload.userId(),
                payload.noteId(),
                noteChunker.chunk(
                    payload.userId(),
                    payload.noteId(),
                    payload.title(),
                    "",
                    payload.tags(),
                    null,
                    version
                )
            );
        }
    }

    private void handleNoteContentSaved(EventProcessingContext context) {
        NoteContentSavedPayload payload = readPayload(context, NoteContentSavedPayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        int version = requireVersion(payload.version());
        requireText(payload.markdownHash(), "markdownHash");

        var existing = noteProjectionStore.findByUserIdAndNoteId(payload.userId(), payload.noteId());
        if (existing.isPresent() && existing.get().stale(version)) {
            return;
        }
        if (existing.isPresent() && existing.get().sameContent(version, payload.markdownHash())) {
            return;
        }

        noteSummaryPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
        NoteProjection base = existing.orElseGet(() -> new NoteProjection(
            payload.userId(),
            payload.noteId(),
            "",
            null,
            List.of(),
            0,
            null,
            true,
            false,
            false,
            false,
            context.eventId(),
            context.envelope().occurredAt()
        ));
        tryIndexFromSnapshot(base, version, payload.markdownHash(), context.eventId(), true);
    }

    private void handleNoteMetadataChanged(EventProcessingContext context) {
        JsonNode payload = context.payload();
        String noteId = requireText(text(payload, "noteId"), "noteId");
        String userId = requireText(text(payload, "userId"), "userId");
        int version = requireVersion(integer(payload, "version"));

        NoteProjection base = noteProjectionStore.findByUserIdAndNoteId(userId, noteId)
            .orElseGet(() -> new NoteProjection(
                userId,
                noteId,
                "",
                null,
                List.of(),
                0,
                null,
                true,
                false,
                false,
                false,
                context.eventId(),
                context.envelope().occurredAt()
            ));
        if (base.stale(version)) {
            return;
        }

        String title = payload.has("title") ? text(payload, "title") : base.title();
        String folderId = payload.has("folderId") ? text(payload, "folderId") : base.folderId();
        List<String> tags = payload.has("tags") ? stringList(payload.get("tags")) : base.tags();
        Boolean archived = payload.hasNonNull("archived") ? payload.get("archived").asBoolean() : base.archived();
        NoteProjection updated = new NoteProjection(
            userId,
            noteId,
            title,
            folderId,
            tags,
            version,
            base.markdownHash(),
            base.contentPending(),
            archived,
            base.trashed(),
            base.deleted(),
            context.eventId(),
            context.envelope().occurredAt()
        );
        noteProjectionStore.save(updated);

        if (!updated.searchable()) {
            noteSearchIndexPort.deleteByUserIdAndNoteId(userId, noteId);
            return;
        }
        tryIndexFromSnapshot(updated, version, updated.markdownHash(), context.eventId(), true);
    }

    private void handleNoteTagsChanged(EventProcessingContext context) {
        NoteTagsChangedPayload payload = readPayload(context, NoteTagsChangedPayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");

        NoteProjection base = noteProjectionStore.findByUserIdAndNoteId(payload.userId(), payload.noteId())
            .orElseGet(() -> new NoteProjection(
                payload.userId(),
                payload.noteId(),
                "",
                null,
                List.of(),
                0,
                null,
                true,
                false,
                false,
                false,
                context.eventId(),
                context.envelope().occurredAt()
            ));
        NoteProjection updated = base.withTags(payload.tags(), context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);
        if (updated.searchable()) {
            tryIndexFromSnapshot(updated, updated.version(), updated.markdownHash(), context.eventId(), true);
        }
    }

    private void handleNoteTrashed(EventProcessingContext context) {
        NoteStatePayload payload = readPayload(context, NoteStatePayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        NoteProjection updated = noteProjectionStore.findByUserIdAndNoteId(payload.userId(), payload.noteId())
            .orElseGet(() -> minimalProjection(payload.userId(), payload.noteId(), context))
            .trashed(context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);
        noteSearchIndexPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
    }

    private void handleNoteDeleted(EventProcessingContext context) {
        NoteStatePayload payload = readPayload(context, NoteStatePayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        NoteProjection updated = noteProjectionStore.findByUserIdAndNoteId(payload.userId(), payload.noteId())
            .orElseGet(() -> minimalProjection(payload.userId(), payload.noteId(), context))
            .deleted(context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);
        noteSearchIndexPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
        noteSummaryPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
    }

    private void handleNotesMoved(EventProcessingContext context) {
        NotesMovedPayload payload = readPayload(context, NotesMovedPayload.class);
        requireText(payload.userId(), "userId");
        List<String> noteIds = payload.noteIds() == null ? List.of() : payload.noteIds();
        for (NoteProjection projection : noteProjectionStore.findByUserIdAndNoteIds(payload.userId(), noteIds)) {
            noteProjectionStore.save(projection.movedTo(
                payload.targetFolderId(),
                context.eventId(),
                context.envelope().occurredAt()
            ));
        }
    }

    private boolean tryIndexFromSnapshot(
        NoteProjection base,
        int minimumVersion,
        String markdownHash,
        String eventId,
        boolean failOnSnapshotError
    ) {
        NoteSnapshot snapshot;
        try {
            snapshot = workspaceNotePort.getNoteSnapshot(base.noteId());
        } catch (WorkspaceNoteAdapterException | IllegalStateException exception) {
            if (!failOnSnapshotError) {
                return false;
            }
            throw EventProcessingException.retryable("SNAPSHOT_UNAVAILABLE", "Workspace note snapshot is not available.");
        }
        if (snapshot == null) {
            if (!failOnSnapshotError) {
                return false;
            }
            throw EventProcessingException.retryable("SNAPSHOT_UNAVAILABLE", "Workspace note snapshot is not available.");
        }
        if (snapshot.version() < minimumVersion) {
            throw EventProcessingException.retryable("SNAPSHOT_STALE", "Workspace note snapshot is older than the event.");
        }

        NoteProjection indexed = base.withSnapshot(
            snapshot.title(),
            snapshot.folderId(),
            snapshot.tags(),
            snapshot.version(),
            markdownHash,
            eventId,
            snapshot.updatedAt() == null ? Instant.now() : snapshot.updatedAt()
        );
        noteProjectionStore.save(indexed);
        if (indexed.searchable()) {
            noteSearchIndexPort.replaceNoteChunks(
                indexed.userId(),
                indexed.noteId(),
                noteChunker.chunk(
                    indexed.userId(),
                    indexed.noteId(),
                    indexed.title(),
                    snapshot.markdown(),
                    indexed.tags(),
                    indexed.markdownHash(),
                    indexed.version()
                )
            );
        }
        return indexed.searchable();
    }

    private <T> T readPayload(EventProcessingContext context, Class<T> payloadType) {
        try {
            return objectMapper.treeToValue(context.payload(), payloadType);
        } catch (JsonProcessingException exception) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", "Event payload does not match " + payloadType.getSimpleName());
        }
    }

    private static NoteProjection minimalProjection(String userId, String noteId, EventProcessingContext context) {
        return new NoteProjection(
            userId,
            noteId,
            "",
            null,
            List.of(),
            0,
            null,
            true,
            false,
            false,
            false,
            context.eventId(),
            context.envelope().occurredAt()
        );
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", name + " must not be blank.");
        }
        return value;
    }

    private static int requireVersion(Integer version) {
        if (version == null) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", "version must be present.");
        }
        return version;
    }

    private static String text(JsonNode payload, String fieldName) {
        if (!payload.has(fieldName) || payload.get(fieldName).isNull()) {
            return null;
        }
        String value = payload.get(fieldName).asText();
        return value.isBlank() ? null : value;
    }

    private static Integer integer(JsonNode payload, String fieldName) {
        if (!payload.has(fieldName) || payload.get(fieldName).isNull()) {
            return null;
        }
        return payload.get(fieldName).asInt();
    }

    private static List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
            .filter(JsonNode::isTextual)
            .map(JsonNode::asText)
            .filter(value -> !value.isBlank())
            .distinct()
            .toList();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteCreatedPayload(String noteId, String userId, String title, String folderId, List<String> tags, Integer version) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteContentSavedPayload(String noteId, String userId, Integer version, String markdownHash, Instant savedAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteTagsChangedPayload(String noteId, String userId, List<String> tags) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteStatePayload(String noteId, String userId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NotesMovedPayload(String userId, List<String> noteIds, String sourceFolderId, String targetFolderId) {
    }
}
