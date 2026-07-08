package com.brainx.intelligence.infrastructure.repair;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

class LegacyDefaultDocumentGroupVectorRepairRunnerTest {

    @Test
    void disabledDoesNotDeleteVectors() {
        LegacyDefaultDocumentGroupRepairProperties properties = new LegacyDefaultDocumentGroupRepairProperties();
        FakeTargetStore targetStore = new FakeTargetStore(List.of(new LegacyDefaultDocumentGroupRepairTarget("user-1", "note-1")));
        FakeSearchIndexPort searchIndexPort = new FakeSearchIndexPort();

        runner(properties, targetStore, searchIndexPort).run(null);

        assertThat(searchIndexPort.deletedKeys).isEmpty();
        assertThat(targetStore.succeeded).isEmpty();
    }

    @Test
    void enabledDeletesLegacyDefaultVectorsAndMarksSuccess() {
        LegacyDefaultDocumentGroupRepairProperties properties = enabledProperties();
        FakeTargetStore targetStore = new FakeTargetStore(List.of(
            new LegacyDefaultDocumentGroupRepairTarget("user-1", "note-1"),
            new LegacyDefaultDocumentGroupRepairTarget("user-2", "note-2")
        ));
        FakeSearchIndexPort searchIndexPort = new FakeSearchIndexPort();

        runner(properties, targetStore, searchIndexPort).run(null);

        assertThat(searchIndexPort.deletedKeys).containsExactly(
            "user-1::default::note-1",
            "user-2::default::note-2"
        );
        assertThat(targetStore.succeeded).containsExactlyElementsOf(targetStore.targets);
        assertThat(targetStore.failed).isEmpty();
    }

    @Test
    void deleteFailureIsRecordedAndDoesNotStopRemainingTargets() {
        LegacyDefaultDocumentGroupRepairProperties properties = enabledProperties();
        FakeTargetStore targetStore = new FakeTargetStore(List.of(
            new LegacyDefaultDocumentGroupRepairTarget("user-1", "note-fail"),
            new LegacyDefaultDocumentGroupRepairTarget("user-2", "note-2")
        ));
        FakeSearchIndexPort searchIndexPort = new FakeSearchIndexPort();
        searchIndexPort.failNoteId = "note-fail";

        runner(properties, targetStore, searchIndexPort).run(null);

        assertThat(searchIndexPort.deletedKeys).containsExactly("user-2::default::note-2");
        assertThat(targetStore.failed).containsExactly(targetStore.targets.getFirst());
        assertThat(targetStore.failureMessages.getFirst()).contains("boom");
        assertThat(targetStore.succeeded).containsExactly(targetStore.targets.get(1));
    }

    private static LegacyDefaultDocumentGroupVectorRepairRunner runner(
        LegacyDefaultDocumentGroupRepairProperties properties,
        FakeTargetStore targetStore,
        FakeSearchIndexPort searchIndexPort
    ) {
        return new LegacyDefaultDocumentGroupVectorRepairRunner(properties, targetStore, searchIndexPort);
    }

    private static LegacyDefaultDocumentGroupRepairProperties enabledProperties() {
        LegacyDefaultDocumentGroupRepairProperties properties = new LegacyDefaultDocumentGroupRepairProperties();
        properties.setEnabled(true);
        return properties;
    }

    private static final class FakeTargetStore implements LegacyDefaultDocumentGroupRepairTargetStore {

        private final List<LegacyDefaultDocumentGroupRepairTarget> targets;
        private final List<LegacyDefaultDocumentGroupRepairTarget> succeeded = new ArrayList<>();
        private final List<LegacyDefaultDocumentGroupRepairTarget> failed = new ArrayList<>();
        private final List<String> failureMessages = new ArrayList<>();

        private FakeTargetStore(List<LegacyDefaultDocumentGroupRepairTarget> targets) {
            this.targets = targets;
        }

        @Override
        public List<LegacyDefaultDocumentGroupRepairTarget> findPendingVectorCleanupTargets() {
            return targets;
        }

        @Override
        public void markVectorCleanupSucceeded(LegacyDefaultDocumentGroupRepairTarget target) {
            succeeded.add(target);
        }

        @Override
        public void markVectorCleanupFailed(LegacyDefaultDocumentGroupRepairTarget target, String errorMessage) {
            failed.add(target);
            failureMessages.add(errorMessage);
        }
    }

    private static final class FakeSearchIndexPort implements NoteSearchIndexPort {

        private final List<String> deletedKeys = new ArrayList<>();
        private String failNoteId;

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public boolean replaceNoteChunks(String userId, String documentGroupId, String noteId, List<NoteSearchDocument> chunks) {
            return false;
        }

        @Override
        public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            if (noteId.equals(failNoteId)) {
                throw new IllegalStateException("boom");
            }
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
            return true;
        }
    }
}
