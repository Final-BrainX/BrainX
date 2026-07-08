package com.brainx.intelligence.exploration.application.port.outbound;

import java.util.List;

import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchScope;

public interface NoteChunkRetrievalPort {

    List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query);

    record NoteChunkSearchQuery(
        String userId,
        SearchScope scope,
        String documentGroupId,
        String queryText,
        int topK
    ) {

        public static final int DEFAULT_TOP_K = 8;
        public static final int MAX_TOP_K = 40;

        public NoteChunkSearchQuery(String userId, String documentGroupId, String queryText, int topK) {
            this(userId, SearchScope.DOCUMENT_GROUP, documentGroupId, queryText, topK);
        }

        public NoteChunkSearchQuery {
            userId = requireText(userId, "userId");
            scope = scope == null ? SearchScope.DOCUMENT_GROUP : scope;
            documentGroupId = scope == SearchScope.USER ? null : requireText(documentGroupId, "documentGroupId");
            queryText = requireText(queryText, "queryText");
            topK = normalizeTopK(topK);
        }

        public static int normalizeTopK(int value) {
            if (value <= 0) {
                return DEFAULT_TOP_K;
            }
            return Math.min(value, MAX_TOP_K);
        }

        private static String requireText(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new ExplorationDomainException(name + " must not be blank.");
            }
            return value;
        }
    }
}
