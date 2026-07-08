package com.brainx.intelligence.infrastructure.repair;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

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
        int batchSize = properties.normalizedBatchSize();
        Set<LegacyDefaultDocumentGroupBackfillTarget> blockedTargets = new LinkedHashSet<>();
        int attempted = 0;
        int succeeded = 0;
        int skipped = 0;
        int failed = 0;

        while (true) {
            List<LegacyDefaultDocumentGroupBackfillTarget> targets = targetStore.findDefaultOnlyProjectionTargets(
                batchSize + blockedTargets.size()
            );
            List<LegacyDefaultDocumentGroupBackfillTarget> nextTargets = targets.stream()
                .filter(target -> !blockedTargets.contains(target))
                .limit(batchSize)
                .toList();
            if (nextTargets.isEmpty()) {
                break;
            }

            for (LegacyDefaultDocumentGroupBackfillTarget target : nextTargets) {
                attempted++;
                try {
                    BackfillResult result = backfill(target);
                    if (result == BackfillResult.SUCCEEDED) {
                        succeeded++;
                    } else {
                        skipped++;
                        blockedTargets.add(target);
                    }
                } catch (RuntimeException exception) {
                    failed++;
                    blockedTargets.add(target);
                    LOGGER.warn(
                        "Failed to backfill legacy default document group projection for userId={}, noteId={}.",
                        target.userId(),
                        target.noteId(),
                        exception
                    );
                }
            }
        }

        if (attempted == 0) {
            LOGGER.info("No legacy default document group backfill targets found.");
            return;
        }
        LOGGER.info(
            "Legacy default document group backfill completed. attempted={}, succeeded={}, skipped={}, failed={}, blocked={}",
            attempted,
            succeeded,
            skipped,
            failed,
            blockedTargets.size()
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
                repairEventId(target, documentGroupId),
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

    private static String repairEventId(LegacyDefaultDocumentGroupBackfillTarget target, String documentGroupId) {
        return REPAIR_EVENT_PREFIX + sha256(target.userId() + ":" + target.noteId() + ":" + documentGroupId);
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
