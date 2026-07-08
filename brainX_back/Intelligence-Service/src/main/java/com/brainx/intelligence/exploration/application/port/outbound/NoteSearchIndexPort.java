package com.brainx.intelligence.exploration.application.port.outbound;

import java.util.List;
import java.util.Map;

import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

public interface NoteSearchIndexPort {

    List<SemanticSearchResult> search(NoteSearchQuery query);

    NoteSearchDocument save(NoteSearchDocument document);

    boolean replaceNoteChunks(String userId, String documentGroupId, String noteId, List<NoteSearchDocument> chunks);

    default boolean applyNoteChunkDelta(String userId, String documentGroupId, String noteId, NoteChunkDelta delta) {
        return false;
    }

    boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId);

    record NoteChunkDelta(
        List<NoteSearchDocument> upsertChunks,
        List<String> deleteChunkIds,
        List<NoteSearchDocument> payloadOnlyChunks
    ) {
        public NoteChunkDelta {
            upsertChunks = upsertChunks == null ? List.of() : List.copyOf(upsertChunks);
            deleteChunkIds = deleteChunkIds == null
                ? List.of()
                : deleteChunkIds.stream()
                    .filter(value -> value != null && !value.isBlank())
                    .distinct()
                    .toList();
            payloadOnlyChunks = payloadOnlyChunks == null ? List.of() : List.copyOf(payloadOnlyChunks);
        }

        public boolean empty() {
            return upsertChunks.isEmpty() && deleteChunkIds.isEmpty() && payloadOnlyChunks.isEmpty();
        }
    }

    record NoteSearchQuery(
        String userId,
        SearchScope scope,
        String documentGroupId,
        String queryText,
        Map<String, Object> filters,
        int limit,
        List<String> hybridWithClientKeywordIds
    ) {
        public NoteSearchQuery(
            String userId,
            String documentGroupId,
            String queryText,
            Map<String, Object> filters,
            int limit,
            List<String> hybridWithClientKeywordIds
        ) {
            this(userId, SearchScope.DOCUMENT_GROUP, documentGroupId, queryText, filters, limit, hybridWithClientKeywordIds);
        }

        public NoteSearchQuery {
            scope = scope == null ? SearchScope.DOCUMENT_GROUP : scope;
            documentGroupId = scope == SearchScope.USER ? null : requireText(documentGroupId, "documentGroupId");
        }

        private static String requireText(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new ExplorationDomainException(name + " must not be blank.");
            }
            return value;
        }
    }
}
