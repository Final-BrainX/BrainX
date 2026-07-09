package com.brainx.intelligence.infrastructure.events.folder;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.infrastructure.events.consumer.BrainxEventHandler;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingContext;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;
import com.brainx.intelligence.infrastructure.events.note.NoteChunkManifestStore;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class FolderEventHandler implements BrainxEventHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(FolderEventHandler.class);
    private static final Set<String> EVENT_TYPES = Set.of("FolderCreated", "FolderChanged", "FolderDeleted");

    private final ObjectMapper objectMapper;
    private final FolderProjectionStore folderProjectionStore;
    private final NoteProjectionStore noteProjectionStore;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteChunkManifestStore noteChunkManifestStore;
    private final NoteSummaryPort noteSummaryPort;

    public FolderEventHandler(
        ObjectMapper objectMapper,
        FolderProjectionStore folderProjectionStore,
        NoteProjectionStore noteProjectionStore,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteChunkManifestStore noteChunkManifestStore,
        NoteSummaryPort noteSummaryPort
    ) {
        this.objectMapper = objectMapper;
        this.folderProjectionStore = folderProjectionStore;
        this.noteProjectionStore = noteProjectionStore;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteChunkManifestStore = noteChunkManifestStore;
        this.noteSummaryPort = noteSummaryPort;
    }

    @Override
    public Set<String> eventTypes() {
        return EVENT_TYPES;
    }

    @Override
    public void handle(EventProcessingContext context) {
        switch (context.eventType()) {
            case "FolderCreated" -> handleCreated(context);
            case "FolderChanged" -> handleChanged(context);
            case "FolderDeleted" -> handleDeleted(context);
            default -> throw EventProcessingException.nonRetryable("UNSUPPORTED_EVENT_TYPE", "Unsupported folder event type.");
        }
    }

    private void handleCreated(EventProcessingContext context) {
        FolderCreatedPayload payload = readPayload(context, FolderCreatedPayload.class);
        String folderId = requireText(payload.folderId(), "folderId");
        String userId = requireText(payload.userId(), "userId");
        requireText(payload.documentGroupId(), "documentGroupId");
        String name = requireText(payload.name(), "name");
        String parentFolderId = normalizeOptionalText(payload.parentFolderId());

        var existing = folderProjectionStore.findByFolderId(folderId);
        if (existing.isPresent()) {
            return;
        }

        FolderProjection projection = FolderProjection.created(
            folderId,
            userId,
            name,
            parentFolderId,
            context.eventId(),
            context.envelope().occurredAt()
        );
        folderProjectionStore.save(projection);
        LOGGER.info("Folder created: folderId={}, userId={}", folderId, userId);
    }

    private void handleChanged(EventProcessingContext context) {
        FolderChangedPayload payload = readPayload(context, FolderChangedPayload.class);
        String folderId = requireText(payload.folderId(), "folderId");
        String userId = requireText(payload.userId(), "userId");
        requireText(payload.documentGroupId(), "documentGroupId");
        String name = normalizeOptionalText(payload.name());
        String parentFolderId = normalizeOptionalText(payload.parentFolderId());
        Integer order = payload.order();
        boolean parentFolderSpecified = context.payload().hasNonNull("parentFolderId");

        var existing = folderProjectionStore.findByFolderId(folderId);
        if (existing.isEmpty() && (name == null || !parentFolderSpecified)) {
            throw EventProcessingException.retryable(
                "FOLDER_PROJECTION_UNAVAILABLE",
                "FolderChanged cannot create a complete projection before FolderCreated is consumed."
            );
        }
        if (existing.isEmpty()) {
            folderProjectionStore.save(new FolderProjection(
                folderId,
                userId,
                name,
                parentFolderId,
                order,
                false,
                null,
                null,
                context.eventId(),
                context.envelope().occurredAt()
            ));
            LOGGER.info("Folder changed before create: folderId={}, userId={}", folderId, userId);
            return;
        }
        FolderProjection current = existing.orElseThrow();
        String nextName = name == null ? current.name() : name;
        String nextParentFolderId = parentFolderSpecified ? parentFolderId : current.parentFolderId();
        Integer nextOrder = order == null ? current.order() : order;
        if (current.sameFolder(nextName, nextParentFolderId, nextOrder, current.deleted(), current.childNoteAction(), current.targetFolderId())) {
            return;
        }
        folderProjectionStore.save(current.withChanges(
            nextName,
            nextParentFolderId,
            nextOrder,
            context.eventId(),
            context.envelope().occurredAt()
        ));
        LOGGER.info("Folder changed: folderId={}, userId={}", folderId, userId);
    }

    private void handleDeleted(EventProcessingContext context) {
        FolderDeletedPayload payload = readPayload(context, FolderDeletedPayload.class);
        String userId = requireText(payload.userId(), "userId");
        String documentGroupId = requireText(payload.documentGroupId(), "documentGroupId");
        List<String> folderIds = requireTextList(payload.folderIds(), "folderIds", false);
        List<String> noteIds = requireTextList(payload.noteIds(), "noteIds", true);
        String mode = requireDeleteMode(payload.mode());
        String childNoteAction = mode.toUpperCase(Locale.ROOT);

        for (String folderId : folderIds) {
            var existing = folderProjectionStore.findByFolderId(folderId);
            if (existing.isPresent()
                && existing.get().sameFolder(existing.get().name(), existing.get().parentFolderId(), existing.get().order(), true, childNoteAction, null)) {
                continue;
            }

            FolderProjection projection = existing
                .map(current -> current.deleted(childNoteAction, null, context.eventId(), context.envelope().occurredAt()))
                .orElseGet(() -> new FolderProjection(
                    folderId,
                    userId,
                    null,
                    null,
                    null,
                    true,
                    childNoteAction,
                    null,
                    context.eventId(),
                    context.envelope().occurredAt()
                ));
            folderProjectionStore.save(projection);
        }

        for (String noteId : noteIds) {
            cleanupNoteDeletedByFolder(userId, documentGroupId, noteId, mode, context);
        }
        LOGGER.info("Folders deleted: folderIds={}, noteIds={}, userId={}, mode={}", folderIds.size(), noteIds.size(), userId, mode);
    }

    private void cleanupNoteDeletedByFolder(
        String userId,
        String documentGroupId,
        String noteId,
        String mode,
        EventProcessingContext context
    ) {
        NoteProjection base = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                userId,
                documentGroupId,
                noteId
            )
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

        NoteProjection updated = "trash".equals(mode)
            ? base.trashed(context.eventId(), context.envelope().occurredAt())
            : base.deleted(context.eventId(), context.envelope().occurredAt());
        noteProjectionStore.save(updated);

        boolean removed = noteSearchIndexPort.deleteByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId);
        noteChunkManifestStore.deleteByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId);
        noteSummaryPort.deleteByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId);
        if (removed) {
            noteProjectionStore.save(updated.indexRemoved(context.eventId(), context.envelope().occurredAt()));
        }
    }

    private <T> T readPayload(EventProcessingContext context, Class<T> payloadType) {
        try {
            return objectMapper.treeToValue(context.payload(), payloadType);
        } catch (JsonProcessingException exception) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", "Event payload does not match " + payloadType.getSimpleName());
        }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", name + " must not be blank.");
        }
        return value.trim();
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static List<String> requireTextList(List<String> values, String name, boolean allowEmpty) {
        if (values == null || (!allowEmpty && values.isEmpty())) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", name + " must not be empty.");
        }
        List<String> normalized = new ArrayList<>();
        for (String value : values) {
            String text = requireText(value, name + "[]");
            if (!normalized.contains(text)) {
                normalized.add(text);
            }
        }
        if (!allowEmpty && normalized.isEmpty()) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", name + " must not be empty.");
        }
        return List.copyOf(normalized);
    }

    private static String requireDeleteMode(String mode) {
        String normalized = requireText(mode, "mode").toLowerCase(Locale.ROOT);
        if (!"trash".equals(normalized) && !"permanent".equals(normalized)) {
            throw EventProcessingException.nonRetryable("INVALID_PAYLOAD", "mode must be trash or permanent.");
        }
        return normalized;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record FolderCreatedPayload(
        String folderId,
        String userId,
        String documentGroupId,
        String name,
        String parentFolderId
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record FolderChangedPayload(
        String folderId,
        String userId,
        String documentGroupId,
        String name,
        String parentFolderId,
        Integer order
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record FolderDeletedPayload(
        String userId,
        String documentGroupId,
        List<String> folderIds,
        String mode,
        List<String> noteIds
    ) {
    }
}
