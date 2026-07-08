package com.brainx.intelligence.infrastructure.repair;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.infrastructure.events.note.NoteChunkManifestStore;
import com.brainx.intelligence.infrastructure.events.note.NoteIndexingService;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Component
class LegacyDefaultDocumentGroupBackfillRepairRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(LegacyDefaultDocumentGroupBackfillRepairRunner.class);
    private static final String REPAIR_EVENT_PREFIX = "legacy-default-document-group-backfill:";

    private final LegacyDefaultDocumentGroupBackfillProperties properties;
    private final LegacyDefaultDocumentGroupBackfillTargetStore targetStore;
    private final NoteProjectionStore noteProjectionStore;
    private final NoteChunkManifestStore noteChunkManifestStore;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteIndexingService noteIndexingService;

    LegacyDefaultDocumentGroupBackfillRepairRunner(
        LegacyDefaultDocumentGroupBackfillProperties properties,
        LegacyDefaultDocumentGroupBackfillTargetStore targetStore,
        NoteProjectionStore noteProjectionStore,
        NoteChunkManifestStore noteChunkManifestStore,
        NoteSearchIndexPort noteSearchIndexPort,
        WorkspaceNotePort workspaceNotePort,
        NoteIndexingService noteIndexingService
    ) {
        this.properties = properties;
        this.targetStore = targetStore;
        this.noteProjectionStore = noteProjectionStore;
        this.noteChunkManifestStore = noteChunkManifestStore;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.workspaceNotePort = workspaceNotePort;
        this.noteIndexingService = noteIndexingService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.isEnabled()) {
            return;
        }
        List<LegacyDefaultDocumentGroupBackfillTarget> targets = targetStore.findDefaultOnlyProjectionTargets(
            properties.normalizedBatchSize()
        );
        if (targets.isEmpty()) {
            LOGGER.info("No legacy default document group backfill targets found.");
            return;
        }

        int succeeded = 0;
        int skipped = 0;
        int failed = 0;
        for (LegacyDefaultDocumentGroupBackfillTarget target : targets) {
            try {
                BackfillResult result = backfill(target);
                if (result == BackfillResult.SUCCEEDED) {
                    succeeded++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException exception) {
                failed++;
                LOGGER.warn(
                    "Failed to backfill legacy default document group projection for userId={}, noteId={}.",
                    target.userId(),
                    target.noteId(),
                    exception
                );
            }
        }
        LOGGER.info(
            "Legacy default document group backfill completed. targets={}, succeeded={}, skipped={}, failed={}",
            targets.size(),
            succeeded,
            skipped,
            failed
        );
    }

    private BackfillResult backfill(LegacyDefaultDocumentGroupBackfillTarget target) {
        NoteProjection legacy = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
                target.userId(),
                DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
                target.noteId()
            )
            .orElse(null);
        if (legacy == null) {
            return BackfillResult.SKIPPED;
        }

        NoteSnapshot snapshot = workspaceNotePort.getNoteSnapshot(target.noteId());
        if (snapshot == null || !StringUtils.hasText(snapshot.documentGroupId())) {
            LOGGER.warn(
                "Skipping legacy default document group backfill because snapshot has no documentGroupId. userId={}, noteId={}",
                target.userId(),
                target.noteId()
            );
            return BackfillResult.SKIPPED;
        }

        String documentGroupId = snapshot.documentGroupId().trim();
        if (DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID.equals(documentGroupId)) {
            LOGGER.warn(
                "Skipping legacy default document group backfill because snapshot still points to default. userId={}, noteId={}",
                target.userId(),
                target.noteId()
            );
            return BackfillResult.SKIPPED;
        }

        boolean targetExists = noteProjectionStore.findByUserIdAndDocumentGroupIdAndNoteId(
            target.userId(),
            documentGroupId,
            target.noteId()
        ).isPresent();
        if (!targetExists) {
            NoteProjection base = legacy.withDocumentGroupId(documentGroupId);
            noteIndexingService.indexFromSnapshot(
                base,
                0,
                sha256(snapshot.markdown()),
                REPAIR_EVENT_PREFIX + target.userId() + ":" + target.noteId() + ":" + documentGroupId,
                true,
                true
            );
        }

        noteSearchIndexPort.deleteByUserIdAndDocumentGroupIdAndNoteId(
            target.userId(),
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            target.noteId()
        );
        noteChunkManifestStore.deleteByUserIdAndDocumentGroupIdAndNoteId(
            target.userId(),
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            target.noteId()
        );
        noteProjectionStore.deleteByUserIdAndDocumentGroupIdAndNoteId(
            target.userId(),
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            target.noteId()
        );
        return BackfillResult.SUCCEEDED;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private enum BackfillResult {
        SUCCEEDED,
        SKIPPED
    }
}
