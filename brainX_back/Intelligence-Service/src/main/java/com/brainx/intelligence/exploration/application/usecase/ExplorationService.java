package com.brainx.intelligence.exploration.application.usecase;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort.SemanticSearchPerformedEvent;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SemanticSearchQuery;
import com.brainx.intelligence.exploration.domain.SemanticSearchResults;
import com.brainx.intelligence.exploration.domain.TokenChargeDecision;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

@Service
public class ExplorationService implements SemanticSearchUseCase, GetNoteSummaryUseCase {

    private static final String SOURCE_SERVICE = "AI-Service";
    private static final String SEMANTIC_SEARCH_FEATURE_ID = "semantic-search";
    private static final String SEMANTIC_SEARCH_CAPABILITY = "SEMANTIC_SEARCH";

    private final EntitlementPort entitlementPort;
    private final TokenUsagePort tokenUsagePort;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteSummaryPort noteSummaryPort;
    private final ExplorationEventPort explorationEventPort;

    public ExplorationService(
        EntitlementPort entitlementPort,
        TokenUsagePort tokenUsagePort,
        WorkspaceNotePort workspaceNotePort,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteSummaryPort noteSummaryPort,
        ExplorationEventPort explorationEventPort
    ) {
        this.entitlementPort = entitlementPort;
        this.tokenUsagePort = tokenUsagePort;
        this.workspaceNotePort = workspaceNotePort;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteSummaryPort = noteSummaryPort;
        this.explorationEventPort = explorationEventPort;
    }

    @Override
    public SemanticSearchResponse semanticSearch(SemanticSearchCommand command) {
        var query = new SemanticSearchQuery(
            command.userId(),
            command.query(),
            command.filters(),
            SemanticSearchQuery.normalizeLimit(command.limit()),
            command.hybridWithClientKeywordIds()
        );
        int tokenEstimate = estimateTokens(query.query());
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            query.userId(),
            SEMANTIC_SEARCH_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ExplorationDomainException("AI capability is not available: " + entitlement.reasonCode());
        }

        var matches = noteSearchIndexPort.search(
            new NoteSearchQuery(
                query.userId(),
                query.query(),
                query.filters(),
                query.limit(),
                query.hybridWithClientKeywordIds()
            )
        );
        var results = new SemanticSearchResults(matches, TokenChargeDecision.charged(tokenEstimate));
        String causationId = UUID.randomUUID().toString();

        tokenUsagePort.recordTokenUsage(new TokenUsageRecord(
            UUID.randomUUID().toString(),
            query.userId(),
            SOURCE_SERVICE,
            SEMANTIC_SEARCH_FEATURE_ID,
            null,
            tokenEstimate,
            0,
            (BigDecimal) null,
            causationId
        ));
        explorationEventPort.semanticSearchPerformed(new SemanticSearchPerformedEvent(
            query.userId(),
            sha256(query.userId() + "\n" + query.query()),
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
