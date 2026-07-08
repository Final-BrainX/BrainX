package com.brainx.intelligence.infrastructure.repair;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Component
class LegacyDefaultDocumentGroupVectorRepairRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(LegacyDefaultDocumentGroupVectorRepairRunner.class);

    private final LegacyDefaultDocumentGroupRepairProperties properties;
    private final LegacyDefaultDocumentGroupRepairTargetStore targetStore;
    private final NoteSearchIndexPort noteSearchIndexPort;

    LegacyDefaultDocumentGroupVectorRepairRunner(
        LegacyDefaultDocumentGroupRepairProperties properties,
        LegacyDefaultDocumentGroupRepairTargetStore targetStore,
        NoteSearchIndexPort noteSearchIndexPort
    ) {
        this.properties = properties;
        this.targetStore = targetStore;
        this.noteSearchIndexPort = noteSearchIndexPort;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.isEnabled()) {
            return;
        }

        List<LegacyDefaultDocumentGroupRepairTarget> targets = targetStore.findPendingVectorCleanupTargets();
        if (targets.isEmpty()) {
            LOGGER.info("No legacy default document group vector cleanup targets found.");
            return;
        }

        int succeeded = 0;
        int failed = 0;
        for (LegacyDefaultDocumentGroupRepairTarget target : targets) {
            try {
                noteSearchIndexPort.deleteByUserIdAndDocumentGroupIdAndNoteId(
                    target.userId(),
                    DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
                    target.noteId()
                );
                targetStore.markVectorCleanupSucceeded(target);
                succeeded++;
            } catch (RuntimeException exception) {
                targetStore.markVectorCleanupFailed(target, safeMessage(exception));
                LOGGER.warn(
                    "Failed to cleanup legacy default document group vector for userId={}, noteId={}.",
                    target.userId(),
                    target.noteId(),
                    exception
                );
                failed++;
            }
        }
        LOGGER.info(
            "Legacy default document group vector cleanup completed. targets={}, succeeded={}, failed={}",
            targets.size(),
            succeeded,
            failed
        );
    }

    private static String safeMessage(RuntimeException exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "Legacy default vector cleanup failed.";
        }
        return exception.getMessage();
    }
}
