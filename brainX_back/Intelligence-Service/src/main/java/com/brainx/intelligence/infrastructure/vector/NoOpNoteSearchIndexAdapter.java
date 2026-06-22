package com.brainx.intelligence.infrastructure.vector;

import java.util.List;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

@Component
public class NoOpNoteSearchIndexAdapter implements NoteSearchIndexPort, NoteChunkRetrievalPort {

    @Override
    public List<SemanticSearchResult> search(NoteSearchQuery query) {
        return List.of();
    }

    @Override
    public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
        return List.of();
    }

    @Override
    public NoteSearchDocument save(NoteSearchDocument document) {
        return document;
    }

    @Override
    public boolean replaceNoteChunks(String userId, String documentGroupId, String noteId, List<NoteSearchDocument> chunks) {
        // No-op fallback for local contexts without a vector store.
        return false;
    }

    @Override
    public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
        // No-op fallback for local contexts without a vector store.
        return false;
    }
}
