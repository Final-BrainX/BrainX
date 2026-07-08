package com.brainx.intelligence.exploration.application.port.inbound;

import java.util.List;
import java.util.Map;

import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchMode;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.shared.domain.DocumentGroups;

public interface SemanticSearchUseCase {

    SemanticSearchResponse semanticSearch(SemanticSearchCommand command);

    record SemanticSearchCommand(
        String userId,
        SearchScope scope,
        String documentGroupId,
        String query,
        Map<String, Object> filters,
        Integer limit,
        List<String> hybridWithClientKeywordIds,
        SearchMode searchMode
    ) {
        public SemanticSearchCommand(
            String userId,
            SearchScope scope,
            String documentGroupId,
            String query,
            Map<String, Object> filters,
            Integer limit,
            List<String> hybridWithClientKeywordIds
        ) {
            this(userId, scope, documentGroupId, query, filters, limit, hybridWithClientKeywordIds, SearchMode.SEMANTIC);
        }

        public SemanticSearchCommand(
            String userId,
            String documentGroupId,
            String query,
            Map<String, Object> filters,
            Integer limit,
            List<String> hybridWithClientKeywordIds
        ) {
            this(userId, SearchScope.DOCUMENT_GROUP, documentGroupId, query, filters, limit, hybridWithClientKeywordIds, SearchMode.SEMANTIC);
        }

        public SemanticSearchCommand(
            String userId,
            String query,
            Map<String, Object> filters,
            Integer limit,
            List<String> hybridWithClientKeywordIds
        ) {
            this(userId, SearchScope.DOCUMENT_GROUP, null, query, filters, limit, hybridWithClientKeywordIds, SearchMode.SEMANTIC);
        }

        public SemanticSearchCommand {
            scope = scope == null ? SearchScope.DOCUMENT_GROUP : scope;
            searchMode = searchMode == null ? SearchMode.SEMANTIC : searchMode;
            if (scope == SearchScope.USER) {
                if (documentGroupId != null && !documentGroupId.isBlank()) {
                    throw new ExplorationDomainException("documentGroupId must be omitted when scope is USER.");
                }
                documentGroupId = null;
            } else {
                documentGroupId = DocumentGroups.normalize(documentGroupId);
            }
        }
    }

    record SemanticSearchResponse(
        List<SearchResultView> results,
        Integer tokenEstimate,
        boolean charged
    ) {
    }

    record SearchResultView(
        String noteId,
        String title,
        String excerpt,
        double score,
        SearchMatchType matchedType
    ) {
    }
}
