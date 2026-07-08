package com.brainx.intelligence.exploration.application.port.outbound;

import java.util.List;

import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SemanticSearchQuery;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.shared.domain.DocumentGroups;

public interface NoteKeywordSearchPort {

    List<SemanticSearchResult> searchKeyword(KeywordSearchQuery query);

    record KeywordSearchQuery(
        String userId,
        SearchScope scope,
        String documentGroupId,
        String queryText,
        int limit
    ) {
        public KeywordSearchQuery {
            userId = requireText(userId, "userId");
            scope = scope == null ? SearchScope.DOCUMENT_GROUP : scope;
            documentGroupId = scope == SearchScope.USER ? null : DocumentGroups.normalize(documentGroupId);
            queryText = requireText(queryText, "queryText");
            limit = SemanticSearchQuery.normalizeLimit(limit);
        }

        private static String requireText(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new ExplorationDomainException(name + " must not be blank.");
            }
            return value.trim();
        }
    }
}
