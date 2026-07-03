package com.brainx.intelligence.infrastructure.events.note;

import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.infrastructure.events.consumer.EventProcessingException;
import com.brainx.intelligence.infrastructure.workspace.WorkspaceNoteAdapterException;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Service
public class NoteIndexingService {

    private final NoteProjectionStore noteProjectionStore;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final MarkdownNoteChunker noteChunker;
    private final NoteChunkManifestStore noteChunkManifestStore;
    private final NoteChunkIndexPlanner noteChunkIndexPlanner;

    public NoteIndexingService(
        NoteProjectionStore noteProjectionStore,
        WorkspaceNotePort workspaceNotePort,
        NoteSearchIndexPort noteSearchIndexPort,
        MarkdownNoteChunker noteChunker,
        NoteChunkManifestStore noteChunkManifestStore,
        NoteChunkIndexPlanner noteChunkIndexPlanner
    ) {
        this.noteProjectionStore = noteProjectionStore;
        this.workspaceNotePort = workspaceNotePort;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteChunker = noteChunker;
        this.noteChunkManifestStore = noteChunkManifestStore;
        this.noteChunkIndexPlanner = noteChunkIndexPlanner;
    }

    public boolean indexFromSnapshot(
        NoteProjection base,
        int minimumVersion,
        String markdownHash,
        String eventId,
        boolean failOnSnapshotError,
        boolean forceFullReplace
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

        boolean titleChanged = base.searchIndexStatus() == NoteSearchIndexStatus.INDEXED
            && !sameValue(base.title(), snapshot.title());
        boolean requiresFullReplace = forceFullReplace
            || titleChanged
            || requiresIndexRecovery(base.searchIndexStatus());
        NoteProjection indexed = base.withDocumentGroupId(snapshotDocumentGroupId(base, snapshot)).withSnapshot(
            snapshot.title(),
            snapshot.folderId(),
            snapshot.tags(),
            snapshot.version(),
            markdownHash,
            snapshot.markdown(),
            eventId,
            snapshot.updatedAt() == null ? Instant.now() : snapshot.updatedAt()
        );
        noteProjectionStore.save(indexed);
        if (indexed.searchable()) {
            replaceIndex(
                indexed,
                noteChunker.chunk(
                    indexed.userId(),
                    indexed.documentGroupId(),
                    indexed.noteId(),
                    indexed.title(),
                    snapshot.markdown(),
                    indexed.tags(),
                    indexed.markdownHash(),
                    indexed.version()
                ),
                indexed.version(),
                indexed.markdownHash(),
                eventId,
                requiresFullReplace
            );
        }
        return true;
    }

    public void replaceProvisionalIndex(NoteProjection projection, List<NoteSearchDocument> chunks, String eventId) {
        try {
            Instant indexedAt = Instant.now();
            boolean indexed = noteSearchIndexPort.replaceNoteChunks(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId(),
                chunks
            );
            if (indexed) {
                noteChunkManifestStore.replaceForNote(
                    projection.userId(),
                    projection.documentGroupId(),
                    projection.noteId(),
                    manifestsFor(chunks, projection.version(), null, indexedAt)
                );
                noteProjectionStore.save(projection.provisionallyIndexed(projection.version(), indexedAt));
            }
        } catch (RuntimeException exception) {
            noteProjectionStore.save(projection.indexFailed(eventId, Instant.now()));
            throw exception;
        }
    }

    public void removeIndex(NoteProjection projection, String eventId) {
        try {
            boolean removed = noteSearchIndexPort.deleteByUserIdAndDocumentGroupIdAndNoteId(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId()
            );
            if (removed) {
                noteChunkManifestStore.deleteByUserIdAndDocumentGroupIdAndNoteId(
                    projection.userId(),
                    projection.documentGroupId(),
                    projection.noteId()
                );
                noteProjectionStore.save(projection.indexRemoved(eventId, Instant.now()));
            }
        } catch (RuntimeException exception) {
            noteProjectionStore.save(projection.indexFailed(eventId, Instant.now()));
            throw exception;
        }
    }

    private void replaceIndex(
        NoteProjection projection,
        List<NoteSearchDocument> chunks,
        int indexedVersion,
        String indexedMarkdownHash,
        String eventId,
        boolean forceFullReplace
    ) {
        try {
            Instant indexedAt = Instant.now();
            NoteChunkIndexPlan plan = noteChunkIndexPlanner.plan(
                noteChunkManifestStore.findByUserIdAndDocumentGroupIdAndNoteId(
                    projection.userId(),
                    projection.documentGroupId(),
                    projection.noteId()
                ),
                chunks,
                MarkdownNoteChunker.CHUNKER_VERSION,
                indexedVersion,
                indexedMarkdownHash,
                indexedAt,
                forceFullReplace
            );
            boolean indexed = applyIndexPlan(projection, chunks, plan);
            if (indexed) {
                noteChunkManifestStore.replaceForNote(
                    projection.userId(),
                    projection.documentGroupId(),
                    projection.noteId(),
                    plan.manifests()
                );
                noteProjectionStore.save(projection.indexed(indexedVersion, indexedMarkdownHash, indexedAt));
            }
        } catch (RuntimeException exception) {
            noteProjectionStore.save(projection.indexFailed(eventId, Instant.now()));
            throw exception;
        }
    }

    private boolean applyIndexPlan(
        NoteProjection projection,
        List<NoteSearchDocument> chunks,
        NoteChunkIndexPlan plan
    ) {
        if (plan.fullReplace()) {
            return noteSearchIndexPort.replaceNoteChunks(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId(),
                chunks
            );
        }
        if (plan.delta().empty()) {
            return true;
        }
        return noteSearchIndexPort.applyNoteChunkDelta(
            projection.userId(),
            projection.documentGroupId(),
            projection.noteId(),
            plan.delta()
        );
    }

    private static List<NoteIndexChunkManifest> manifestsFor(
        List<NoteSearchDocument> chunks,
        Integer indexedVersion,
        String indexedMarkdownHash,
        Instant indexedAt
    ) {
        return chunks.stream()
            .map(chunk -> NoteIndexChunkManifest.fromDocument(
                chunk,
                MarkdownNoteChunker.CHUNKER_VERSION,
                indexedVersion,
                indexedMarkdownHash,
                indexedAt
            ))
            .toList();
    }

    private static boolean requiresIndexRecovery(NoteSearchIndexStatus status) {
        return status == NoteSearchIndexStatus.NOT_INDEXED
            || status == NoteSearchIndexStatus.PROVISIONAL
            || status == NoteSearchIndexStatus.FAILED;
    }

    private static String snapshotDocumentGroupId(NoteProjection base, NoteSnapshot snapshot) {
        if (!DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID.equals(base.documentGroupId())) {
            return base.documentGroupId();
        }
        return snapshot.documentGroupId();
    }

    private static boolean sameValue(String left, String right) {
        if (left == null) {
            return right == null;
        }
        return left.equals(right);
    }
}
