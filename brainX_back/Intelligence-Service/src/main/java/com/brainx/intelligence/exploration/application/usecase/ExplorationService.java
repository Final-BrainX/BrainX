package com.brainx.intelligence.exploration.application.usecase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort;
import com.brainx.intelligence.exploration.application.port.outbound.ExplorationEventPort.SemanticSearchPerformedEvent;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort.KeywordSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSummaryPort;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.ExplorationInsufficientContentException;
import com.brainx.intelligence.exploration.domain.NoteSummary;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchQuery;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.exploration.domain.SemanticSearchResults;
import com.brainx.intelligence.exploration.domain.TokenChargeDecision;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

@Service
public class ExplorationService implements SemanticSearchUseCase, GetNoteSummaryUseCase {

    private static final String SEMANTIC_SEARCH_CAPABILITY = "SEMANTIC_SEARCH";
    private static final String NOTE_SUMMARY_CAPABILITY = "NOTE_SUMMARY";
    private static final String NOTE_SUMMARY_FEATURE_ID = "note-summary-chat";
    private static final String NOTE_SUMMARY_PROMPT_KEY = "note-summary";
    private static final int MIN_SUMMARY_TEXT_CHARS = 80;
    private static final Pattern MARKDOWN_LINK = Pattern.compile("\\[([^\\]]+)]\\(([^)]+)\\)");

    private final EntitlementPort entitlementPort;
    private final WorkspaceNotePort workspaceNotePort;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteIndexStatusPort noteIndexStatusPort;
    private final NoteKeywordSearchPort noteKeywordSearchPort;
    private final NoteSummaryPort noteSummaryPort;
    private final ExplorationEventPort explorationEventPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final SemanticSearchProperties semanticSearchProperties;
    private final NoteSummaryProperties noteSummaryProperties;

    public ExplorationService(
        EntitlementPort entitlementPort,
        WorkspaceNotePort workspaceNotePort,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteIndexStatusPort noteIndexStatusPort,
        NoteKeywordSearchPort noteKeywordSearchPort,
        NoteSummaryPort noteSummaryPort,
        ExplorationEventPort explorationEventPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        SemanticSearchProperties semanticSearchProperties,
        NoteSummaryProperties noteSummaryProperties
    ) {
        this.entitlementPort = entitlementPort;
        this.workspaceNotePort = workspaceNotePort;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteIndexStatusPort = noteIndexStatusPort;
        this.noteKeywordSearchPort = noteKeywordSearchPort;
        this.noteSummaryPort = noteSummaryPort;
        this.explorationEventPort = explorationEventPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.semanticSearchProperties = semanticSearchProperties;
        this.noteSummaryProperties = noteSummaryProperties;
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
        List<SemanticSearchResult> matches = filterSemanticMatches(noteSearchIndexPort.search(toSemanticQuery(query)));
        return new SemanticSearchResults(matches, TokenChargeDecision.charged(tokenEstimate));
    }

    private SemanticSearchResults keywordResults(SemanticSearchQuery query) {
        List<SemanticSearchResult> matches = noteKeywordSearchPort.searchKeyword(toKeywordQuery(query));
        return new SemanticSearchResults(matches, TokenChargeDecision.notCharged(0));
    }

    private SemanticSearchResults hybridResults(SemanticSearchQuery query) {
        int tokenEstimate = estimateTokens(query.query());
        checkSemanticSearchEntitlement(query.userId(), tokenEstimate);
        List<SemanticSearchResult> semanticMatches = filterSemanticMatches(noteSearchIndexPort.search(toSemanticQuery(query)));
        List<SemanticSearchResult> keywordMatches = noteKeywordSearchPort.searchKeyword(toKeywordQuery(query));
        return new SemanticSearchResults(
            mergeHybridResults(semanticMatches, keywordMatches, query.limit()),
            TokenChargeDecision.charged(tokenEstimate)
        );
    }

    private List<SemanticSearchResult> filterSemanticMatches(List<SemanticSearchResult> matches) {
        double minScore = semanticSearchProperties.getMinScore();
        return nullToEmptyResults(matches).stream()
            .filter(result -> result.score() >= minScore)
            .toList();
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

        return toSummaryResult(summary);
    }

    @Override
    public NoteSummaryResult generateNoteSummary(GenerateNoteSummaryCommand command) {
        String userId = requireText(command.userId(), "userId");
        String noteId = requireText(command.noteId(), "noteId");
        String documentGroupId = requireText(command.documentGroupId(), "documentGroupId");
        ensureProjectionExists(userId, documentGroupId, noteId);
        var snapshot = workspaceNotePort.getNoteSnapshot(noteId);
        if (snapshot == null) {
            throw new ExplorationDomainException("Note snapshot is not available: " + noteId);
        }
        if (!documentGroupId.equals(snapshot.documentGroupId())) {
            throw new ExplorationDomainException("Note snapshot documentGroupId does not match request.");
        }

        String plainText = plainText(snapshot.markdown());
        if (charCount(plainText) < MIN_SUMMARY_TEXT_CHARS) {
            throw new ExplorationInsufficientContentException("요약할 텍스트가 부족합니다. 내용을 더 작성한 뒤 다시 시도해 주세요.");
        }

        String markdownHash = sha256(snapshot.markdown() == null ? "" : snapshot.markdown());
        if (!command.force()) {
            var cached = noteSummaryPort.findByUserIdAndDocumentGroupIdAndNoteIdAndMarkdownHash(
                userId,
                documentGroupId,
                noteId,
                markdownHash
            );
            if (cached.isPresent() && cached.get().source() == com.brainx.intelligence.exploration.domain.SummarySource.AI) {
                return toSummaryResult(cached.get());
            }
        }

        String modelId = noteSummaryProperties.getModel();
        PromptResolution promptResolution = promptRegistryService.resolve(NOTE_SUMMARY_PROMPT_KEY, noteSummaryPrompt());
        String userPrompt = noteSummaryUserPrompt(snapshot.title(), plainText);
        int tokenEstimate = estimateTokens(promptResolution.content() + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            NOTE_SUMMARY_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ExplorationDomainException("AI capability is not available: " + entitlement.reasonCode());
        }

        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, promptResolution.content()),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        var recorded = aiRunRecorder.recordChatGenerateWithRun(
            userId,
            NOTE_SUMMARY_FEATURE_ID,
            promptResolution.promptKey(),
            promptResolution.version(),
            modelId,
            "NOTE_SUMMARY",
            noteId,
            messages,
            Map.of("noteId", noteId, "documentGroupId", documentGroupId, "force", command.force()),
            () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
        );
        var response = recorded.response();
        String generated = normalizeAiSummary(response == null ? "" : response.content());
        if (!StringUtils.hasText(generated)) {
            throw new ExplorationDomainException("AI summary response is empty.");
        }
        aiUsageRecorder.recordChatUsage(userId, NOTE_SUMMARY_FEATURE_ID, modelId, noteId, response == null ? null : response.tokenUsage());
        NoteSummary saved = noteSummaryPort.save(NoteSummary.ai(
            userId,
            documentGroupId,
            noteId,
            generated,
            markdownHash,
            modelId,
            Instant.now()
        ));
        return toSummaryResult(saved);
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
        return value.trim();
    }

    private void ensureProjectionExists(String userId, String documentGroupId, String noteId) {
        boolean exists = noteIndexStatusPort.findNoteIndexStatuses(userId, documentGroupId, List.of(noteId)).stream()
            .anyMatch(status -> noteId.equals(status.noteId()));
        if (!exists) {
            throw new ExplorationDomainException("Note projection is not available for documentGroupId.");
        }
    }

    private static NoteSummaryResult toSummaryResult(NoteSummary summary) {
        return new NoteSummaryResult(
            summary.noteId(),
            summary.summary(),
            summary.source(),
            blankToNull(summary.documentGroupId()),
            blankToNull(summary.markdownHash()),
            summary.generatedAt(),
            blankToNull(summary.modelId())
        );
    }

    private static String noteSummaryPrompt() {
        return """
            You generate BrainX note hover summaries.
            Return exactly 3 lines.
            Each line should be about 25-35 Korean characters when possible and never exceed 45 characters.
            Do not use bullets, numbering, headings, greetings, labels, markdown, or code fences.
            Do not invent facts that are not present in the note.
            Preserve the note's primary language when possible.
            """;
    }

    private static String noteSummaryUserPrompt(String title, String plainText) {
        return """
            Title:
            %s

            Note text:
            %s
            """.formatted(blankToMarker(title), plainText);
    }

    static String plainText(String markdown) {
        if (markdown == null) {
            return "";
        }
        String withoutLinks = MARKDOWN_LINK.matcher(markdown).replaceAll("$1");
        return withoutLinks
            .replaceAll("(?s)```.*?```", " ")
            .replaceAll("`([^`]+)`", "$1")
            .replaceAll("<[^>]+>", " ")
            .replaceAll("[#>*_~\\[\\]()]"," ")
            .replaceAll("(?m)^\\s*[-+*]\\s+", "")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String normalizeAiSummary(String value) {
        String text = value == null ? "" : value.replace("\r\n", "\n").replace('\r', '\n').trim();
        if (text.isBlank()) {
            return "";
        }
        List<String> lines = text.lines()
            .map(ExplorationService::stripSummaryPrefix)
            .filter(StringUtils::hasText)
            .limit(3)
            .toList();
        if (lines.size() >= 3) {
            return String.join("\n", lines);
        }
        List<String> sentenceLines = List.of(text.split("\\s*(?:[.!?。！？]|다\\.)\\s+")).stream()
            .map(ExplorationService::stripSummaryPrefix)
            .filter(StringUtils::hasText)
            .limit(3)
            .toList();
        return String.join("\n", sentenceLines.isEmpty() ? lines : sentenceLines);
    }

    private static String stripSummaryPrefix(String line) {
        return line == null
            ? ""
            : line.replaceFirst("^\\s*(?:[-*•]+|\\d+[.)]|[①-⑨])\\s*", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static int charCount(String value) {
        return value == null ? 0 : value.codePointCount(0, value.length());
    }

    private static String blankToMarker(String value) {
        return StringUtils.hasText(value) ? value.trim() : "(empty)";
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
