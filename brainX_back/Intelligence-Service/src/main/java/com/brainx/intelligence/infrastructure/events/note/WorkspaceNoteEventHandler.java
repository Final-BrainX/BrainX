package com.brainx.intelligence.infrastructure.events.note;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventHandler;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingContext;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;
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
        "NoteDeleted"
    );
    private final ObjectMapper objectMapper;
    private final NoteProjectionStore noteProjectionStore;
    private final NoteSummaryPort noteSummaryPort;
    private final MarkdownNoteChunker noteChunker;
    private final NoteIndexingService noteIndexingService;

    public WorkspaceNoteEventHandler(
        ObjectMapper objectMapper,
        NoteProjectionStore noteProjectionStore,
        NoteSummaryPort noteSummaryPort,
        MarkdownNoteChunker noteChunker,
        NoteIndexingService noteIndexingService
    ) {
        this.objectMapper = objectMapper;
        this.noteProjectionStore = noteProjectionStore;
        this.noteSummaryPort = noteSummaryPort;
        this.noteChunker = noteChunker;
        this.noteIndexingService = noteIndexingService;
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
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");
        int version = requireVersion(payload.version());

        var existing = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
            payload.userId(),
            documentGroupId,
            payload.noteId()
        );
        if (existing.isPresent() && existing.get().stale(version)) {
            return;
        }

        NoteProjection projection = NoteProjection.created(
            payload.userId(),
            documentGroupId,
            payload.noteId(),
            payload.title(),
            payload.folderId(),
            payload.tags(),
            version,
            context.eventId(),
            context.envelope().occurredAt()
        );
        boolean snapshotAvailable = noteIndexingService.indexFromSnapshot(projection, version, null, context.eventId(), false, false);
        if (!snapshotAvailable) {
            noteProjectionStore.save(projection);
            noteIndexingService.replaceProvisionalIndex(
                projection,
                noteChunker.chunk(
                    payload.userId(),
                    documentGroupId,
                    payload.noteId(),
                    payload.title(),
                    "",
                    payload.tags(),
                    null,
                    version
                ),
                context.eventId()
            );
        }
    }

    private void handleNoteContentSaved(EventProcessingContext context) {
        NoteContentSavedPayload payload = readPayload(context, NoteContentSavedPayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");
        int version = requireVersion(payload.version());
        requireText(payload.markdownHash(), "markdownHash");

        var existing = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
            payload.userId(),
            documentGroupId,
            payload.noteId()
        );
        if (existing.isPresent() && existing.get().stale(version)) {
            return;
        }
        if (existing.isPresent()
            && existing.get().sameContent(version, payload.markdownHash())
            && existing.get().indexedFor(version, payload.markdownHash())) {
            return;
        }

        noteSummaryPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
        NoteProjection base = existing.orElseGet(() -> new NoteProjection(
            payload.userId(),
            documentGroupId,
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
        noteIndexingService.indexFromSnapshot(base, version, payload.markdownHash(), context.eventId(), true, false);
    }

    private void handleNoteMetadataChanged(EventProcessingContext context) {
        JsonNode payload = context.payload();
        String noteId = requireText(text(payload, "noteId"), "noteId");
        String userId = requireText(text(payload, "userId"), "userId");
        String documentGroupId = requireText(text(payload, "documentGroupId"), "documentGroupId");
        int version = requireVersion(integer(payload, "version"));

        NoteProjection base = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId)
            .orElseGet(() -> new NoteProjection(
                userId,
                documentGroupId,
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
        boolean titleChanged = title != null && !title.equals(base.title());
        NoteProjection updated = base.withMetadata(
            title,
            folderId,
            tags,
            archived,
            version,
            context.eventId(),
            context.envelope().occurredAt()
        );
        noteProjectionStore.save(updated);

        if (!updated.searchable()) {
            noteIndexingService.removeIndex(updated, context.eventId());
            return;
        }
        noteIndexingService.indexFromSnapshot(updated, version, updated.markdownHash(), context.eventId(), true, titleChanged);
    }

    private void handleNoteTagsChanged(EventProcessingContext context) {
        NoteTagsChangedPayload payload = readPayload(context, NoteTagsChangedPayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");

        NoteProjection base = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                payload.userId(),
                documentGroupId,
                payload.noteId()
            )
            .orElseGet(() -> new NoteProjection(
                payload.userId(),
                documentGroupId,
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
            noteIndexingService.indexFromSnapshot(updated, updated.version(), updated.markdownHash(), context.eventId(), true, false);
        }
    }

    private void handleNoteTrashed(EventProcessingContext context) {
        NoteStatePayload payload = readPayload(context, NoteStatePayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");
        NoteProjection updated = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                payload.userId(),
                documentGroupId,
                payload.noteId()
            )
            .orElseGet(() -> minimalProjection(payload.userId(), documentGroupId, payload.noteId(), context))
            .trashed(context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);
        noteIndexingService.removeIndex(updated, context.eventId());
    }

    private void handleNoteDeleted(EventProcessingContext context) {
        NoteStatePayload payload = readPayload(context, NoteStatePayload.class);
        requireText(payload.noteId(), "noteId");
        requireText(payload.userId(), "userId");
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");
        NoteProjection updated = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                payload.userId(),
                documentGroupId,
                payload.noteId()
            )
            .orElseGet(() -> minimalProjection(payload.userId(), documentGroupId, payload.noteId(), context))
            .deleted(context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);
        noteIndexingService.removeIndex(updated, context.eventId());
        noteSummaryPort.deleteByUserIdAndNoteId(payload.userId(), payload.noteId());
    }

    private <T> T readPayload(EventProcessingContext context, Class<T> payloadType) {
        try {
            return objectMapper.treeToValue(context.payload(), payloadType);
        } catch (JsonProcessingException exception) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", "Event payload does not match " + payloadType.getSimpleName());
        }
    }

    private static NoteProjection minimalProjection(
        String userId,
        String documentGroupId,
        String noteId,
        EventProcessingContext context
    ) {
        return new NoteProjection(
            userId,
            documentGroupId,
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
    record NoteCreatedPayload(
        String noteId,
        String userId,
        String documentGroupId,
        String title,
        String folderId,
        List<String> tags,
        Integer version
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteContentSavedPayload(
        String noteId,
        String userId,
        String documentGroupId,
        Integer version,
        String markdownHash,
        Instant savedAt
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteTagsChangedPayload(String noteId, String userId, String documentGroupId, List<String> tags) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NoteStatePayload(String noteId, String userId, String documentGroupId) {
    }

}
