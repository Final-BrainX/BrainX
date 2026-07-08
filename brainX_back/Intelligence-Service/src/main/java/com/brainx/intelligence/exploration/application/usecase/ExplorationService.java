package com.brainx.intelligence.exploration.application.usecase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort.SemanticSearchPerformedEvent;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort.KeywordSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchQuery;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.exploration.domain.SemanticSearchResults;
import com.brainx.intelligence.exploration.domain.TokenChargeDecision;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

@Service
public class ExplorationService implements SemanticSearchUseCase, GetNoteSummaryUseCase {

    private static final String SEMANTIC_SEARCH_CAPABILITY = "SEMANTIC_SEARCH";

    private final EntitlementPort entitlementPort;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteKeywordSearchPort noteKeywordSearchPort;
    private final NoteSummaryPort noteSummaryPort;
    private final ExplorationEventPort explorationEventPort;

    public ExplorationService(
        EntitlementPort entitlementPort,
        WorkspaceNotePort workspaceNotePort,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteKeywordSearchPort noteKeywordSearchPort,
        NoteSummaryPort noteSummaryPort,
        ExplorationEventPort explorationEventPort
    ) {
        this.entitlementPort = entitlementPort;
        this.workspaceNotePort = workspaceNotePort;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteKeywordSearchPort = noteKeywordSearchPort;
        this.noteSummaryPort = noteSummaryPort;
        this.explorationEventPort = explorationEventPort;
    }

    @Override
    public SemanticSearchResponse semanticSearch(SemanticSearchCommand command) {
        var query = new SemanticSearchQuery(
            command.userId(),
            command.scope(),
            command.documentGroupId(),
            command.query(),
            command.filters(),
            SemanticSearchQuery.normalizeLimit(command.limit()),
            command.hybridWithClientKeywordIds(),
            command.searchMode()
        );
        var results = switch (query.searchMode()) {
            case SEMANTIC -> semanticResults(query);
            case KEYWORD -> keywordResults(query);
            case HYBRID -> hybridResults(query);
        };

        explorationEventPort.semanticSearchPerformed(new SemanticSearchPerformedEvent(
            query.userId(),
            query.scope(),
            query.documentGroupId(),
            sha256(query.userId() + "\n" + query.searchMode().name() + "\n" + query.scope().name() + "\n" + query.documentGroupId() + "\n" + query.query()),
            results.results().size(),
            results.charged()
        ));

        return new SemanticSearchResponse(
            results.results().stream()
                .map(result -> new SearchResultView(
                    result.noteId(),
                    result.title(),
                    result.excerpt(),
                    result.score(),
                    result.matchedType()
                ))
                .toList(),
            results.tokenEstimate(),
            results.charged()
        );
    }

    private SemanticSearchResults semanticResults(SemanticSearchQuery query) {
        int tokenEstimate = estimateTokens(query.query());
        checkSemanticSearchEntitlement(query.userId(), tokenEstimate);
        List<SemanticSearchResult> matches = noteSearchIndexPort.search(toSemanticQuery(query));
        return new SemanticSearchResults(matches, TokenChargeDecision.charged(tokenEstimate));
    }

    private SemanticSearchResults keywordResults(SemanticSearchQuery query) {
        List<SemanticSearchResult> matches = noteKeywordSearchPort.searchKeyword(toKeywordQuery(query));
        return new SemanticSearchResults(matches, TokenChargeDecision.notCharged(0));
    }

    private SemanticSearchResults hybridResults(SemanticSearchQuery query) {
        int tokenEstimate = estimateTokens(query.query());
        checkSemanticSearchEntitlement(query.userId(), tokenEstimate);
        List<SemanticSearchResult> semanticMatches = noteSearchIndexPort.search(toSemanticQuery(query));
        List<SemanticSearchResult> keywordMatches = noteKeywordSearchPort.searchKeyword(toKeywordQuery(query));
        return new SemanticSearchResults(
            mergeHybridResults(semanticMatches, keywordMatches, query.limit()),
            TokenChargeDecision.charged(tokenEstimate)
        );
    }

    private void checkSemanticSearchEntitlement(String userId, int tokenEstimate) {
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            SEMANTIC_SEARCH_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ExplorationDomainException("AI capability is not available: " + entitlement.reasonCode());
        }
    }

    private static NoteSearchQuery toSemanticQuery(SemanticSearchQuery query) {
        return new NoteSearchQuery(
            query.userId(),
            query.scope(),
            query.documentGroupId(),
            query.query(),
            query.filters(),
            query.limit(),
            query.hybridWithClientKeywordIds()
        );
    }

    private static KeywordSearchQuery toKeywordQuery(SemanticSearchQuery query) {
        return new KeywordSearchQuery(
            query.userId(),
            query.scope(),
            query.documentGroupId(),
            query.query(),
            query.limit()
        );
    }

    private static List<SemanticSearchResult> mergeHybridResults(
        List<SemanticSearchResult> semanticMatches,
        List<SemanticSearchResult> keywordMatches,
        int limit
    ) {
        Map<String, SemanticSearchResult> merged = new LinkedHashMap<>();
        for (SemanticSearchResult result : nullToEmptyResults(semanticMatches)) {
            merged.put(result.noteId(), result);
        }
        for (SemanticSearchResult keyword : nullToEmptyResults(keywordMatches)) {
            SemanticSearchResult existing = merged.get(keyword.noteId());
            if (existing == null) {
                merged.put(keyword.noteId(), keyword);
                continue;
            }
            merged.put(keyword.noteId(), new SemanticSearchResult(
                existing.noteId(),
                existing.title(),
                keyword.excerpt().isBlank() ? existing.excerpt() : keyword.excerpt(),
                Math.min(1.0d, Math.max(existing.score(), keyword.score()) + 0.05d),
                SearchMatchType.HYBRID
            ));
        }
        return merged.values().stream()
            .sorted(Comparator.comparingDouble(SemanticSearchResult::score).reversed())
            .limit(Math.max(0, limit))
            .toList();
    }

    private static List<SemanticSearchResult> nullToEmptyResults(List<SemanticSearchResult> results) {
        return results == null ? List.of() : results;
    }

    @Override
    public NoteSummaryResult getNoteSummary(GetNoteSummaryQuery query) {
        String userId = requireText(query.userId(), "userId");
        String noteId = requireText(query.noteId(), "noteId");
        NoteSummary summary = noteSummaryPort.findByUserIdAndNoteId(userId, noteId)
            .orElseGet(() -> {
                var snapshot = workspaceNotePort.getNoteSnapshot(noteId);
                if (snapshot == null) {
                    throw new ExplorationDomainException("Note snapshot is not available: " + noteId);
                }
                return NoteSummary.excerptFrom(userId, noteId, snapshot.title(), snapshot.markdown());
            });

        return new NoteSummaryResult(summary.noteId(), summary.summary(), summary.source());
    }

    private static int estimateTokens(String text) {
        int codePoints = text.codePointCount(0, text.length());
        return Math.max(1, (codePoints + 3) / 4);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ExplorationDomainException(name + " must not be blank.");
        }
        return value;
    }
}
