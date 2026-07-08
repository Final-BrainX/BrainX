package com.brainx.intelligence.autolink.application.usecase;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkComparison;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCostEstimate;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSourceCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkStrategyResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSuggestion;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkUsageRecord;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkUsageSummary;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort.AutoLinkNoteSource;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkUsageCapturePort;
import com.brainx.intelligence.autolink.domain.MarkdownAnchorLocator;
import com.brainx.intelligence.autolink.domain.MarkdownAnchorLocator.AnchorRange;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class NoteAutoLinkService implements NoteAutoLinkUseCase {

    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_LIMIT_EXCEEDED = "LIMIT_EXCEEDED";
    private static final String STATUS_NO_NOTES = "NO_NOTES";
    private static final String STATUS_AI_UNAVAILABLE = "AI_UNAVAILABLE";
    private static final String VECTOR_FEATURE_ID = "note-auto-link-vector-refine-chat";
    private static final String LLM_ONLY_FEATURE_ID = "note-auto-link-llm-only-chat";
    private static final String RELATION_VERIFIER_FEATURE_ID = "note-auto-link-relation-verifier-chat";
    private static final int SOURCE_WINDOW_LENGTH = 1_200;
    private static final int SOURCE_WINDOW_OVERLAP = 150;
    private static final int SOURCE_MARKDOWN_PROMPT_LIMIT = 4_000;
    private static final int NOTE_CARD_EXCERPT_LIMIT = 500;
    private static final int EVIDENCE_LIMIT = 600;
    private static final int ANCHOR_CONTEXT_RADIUS = 240;
    private static final Set<String> GENERIC_ANCHOR_TERMS = Set.of(
        "ai",
        "api",
        "crud",
        "db",
        "kafka",
        "msa",
        "rag",
        "ui",
        "검색",
        "랜딩",
        "목록",
        "문서",
        "서비스",
        "이벤트",
        "정리"
    );
    private static final Set<String> BROAD_TARGET_TERMS = Set.of(
        "api",
        "architecture",
        "contract",
        "msa",
        "spec",
        "계약",
        "구조",
        "도메인",
        "명세",
        "아키텍처",
        "통합"
    );
    private static final Set<String> VENDOR_ONLY_TERMS = Set.of(
        "chromadb",
        "openai",
        "pinecone",
        "qdrant",
        "voyage",
        "weaviate"
    );
    private static final Set<String> WEAK_RELATION_TYPES = Set.of(
        "BROAD_TOPIC",
        "SAME_DOMAIN_ONLY",
        "VENDOR_NAME_ONLY",
        "WEAK_ANALOGY",
        "UNRELATED"
    );
    private static final Set<String> TOKEN_STOP_WORDS = Set.of(
        "and",
        "api",
        "app",
        "db",
        "file",
        "for",
        "service",
        "the",
        "to",
        "ui",
        "기능",
        "문서",
        "서비스",
        "설정",
        "정리"
    );
    private static final Set<String> FILE_OPERATION_TITLE_TERMS = Set.of(
        "content",
        "file",
        "markdown",
        "save",
        "text"
    );

    private final NoteAutoLinkProperties properties;
    private final AutoLinkNoteSourcePort noteSourcePort;
    private final NoteChunkRetrievalPort noteChunkRetrievalPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final MarkdownAnchorLocator anchorLocator = new MarkdownAnchorLocator();
    private final AutoLinkJsonParser jsonParser;
    private final ObjectProvider<AutoLinkUsageCapturePort> usageCapturePortProvider;
    private final StylePromptCompiler stylePromptCompiler;

    public NoteAutoLinkService(
        NoteAutoLinkProperties properties,
        AutoLinkNoteSourcePort noteSourcePort,
        NoteChunkRetrievalPort noteChunkRetrievalPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        ObjectMapper objectMapper,
        ObjectProvider<AutoLinkUsageCapturePort> usageCapturePortProvider,
        StylePromptCompiler stylePromptCompiler
    ) {
        this.properties = properties;
        this.noteSourcePort = noteSourcePort;
        this.noteChunkRetrievalPort = noteChunkRetrievalPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.jsonParser = new AutoLinkJsonParser(objectMapper);
        this.usageCapturePortProvider = usageCapturePortProvider;
        this.stylePromptCompiler = stylePromptCompiler;
    }

    @Override
    public AutoLinkResult analyze(AutoLinkCommand command) {
        String userId = requireText(command.userId(), "userId");
        String documentGroupId = DocumentGroups.normalize(command.documentGroupId());
        NoteAutoLinkStrategy requestedStrategy = command.strategy() == null
            ? NoteAutoLinkStrategy.COMPARE
            : command.strategy();
        int maxNotes = normalizeMaxNotes(command.maxNotes());
        String modelId = StringUtils.hasText(command.modelId()) ? command.modelId().trim() : properties.getModel();

        List<AutoLinkNoteSource> loaded = noteSourcePort.findSearchableNoteSources(
            userId,
            documentGroupId,
            maxNotes + 1
        );
        if (loaded.size() > maxNotes) {
            return new AutoLinkResult(
                userId,
                documentGroupId,
                requestedStrategy,
                STATUS_LIMIT_EXCEEDED,
                true,
                maxNotes,
                loaded.size(),
                0,
                List.of(),
                new AutoLinkComparison(0, 0, 0)
            );
        }
        if (loaded.isEmpty()) {
            return new AutoLinkResult(
                userId,
                documentGroupId,
                requestedStrategy,
                STATUS_NO_NOTES,
                false,
                maxNotes,
                0,
                0,
                List.of(),
                new AutoLinkComparison(0, 0, 0)
            );
        }

        List<AutoLinkNoteSource> notes = loaded.stream()
            .sorted(Comparator.comparing(AutoLinkNoteSource::noteId))
            .toList();
        List<AutoLinkStrategyResult> strategyResults = switch (requestedStrategy) {
            case COMPARE -> List.of(
                runWithUsageCapture(NoteAutoLinkStrategy.VECTOR_LLM, () -> analyzeVectorLlm(userId, documentGroupId, modelId, notes)),
                runWithUsageCapture(NoteAutoLinkStrategy.LLM_ONLY, () -> analyzeLlmOnly(userId, modelId, notes))
            );
            case VECTOR_LLM -> List.of(runWithUsageCapture(NoteAutoLinkStrategy.VECTOR_LLM, () -> analyzeVectorLlm(userId, documentGroupId, modelId, notes)));
            case LLM_ONLY -> List.of(runWithUsageCapture(NoteAutoLinkStrategy.LLM_ONLY, () -> analyzeLlmOnly(userId, modelId, notes)));
        };

        return new AutoLinkResult(
            userId,
            documentGroupId,
            requestedStrategy,
            STATUS_COMPLETED,
            false,
            maxNotes,
            notes.size(),
            notes.size(),
            strategyResults,
            comparison(strategyResults)
        );
    }

    @Override
    public AutoLinkResult analyzeSourceLinks(AutoLinkSourceCommand command) {
        String userId = requireText(command.userId(), "userId");
        String documentGroupId = DocumentGroups.normalize(command.documentGroupId());
        String sourceNoteId = requireText(command.sourceNoteId(), "sourceNoteId");
        int maxNotes = normalizeMaxNotes(command.maxNotes());
        String modelId = StringUtils.hasText(command.modelId()) ? command.modelId().trim() : properties.getModel();

        Optional<AutoLinkNoteSource> source = noteSourcePort.findGraphAiNoteSource(
            userId,
            documentGroupId,
            sourceNoteId
        );
        if (source.isEmpty()) {
            return new AutoLinkResult(
                userId,
                documentGroupId,
                NoteAutoLinkStrategy.LLM_ONLY,
                STATUS_NO_NOTES,
                false,
                maxNotes,
                0,
                0,
                List.of(),
                new AutoLinkComparison(0, 0, 0)
            );
        }

        List<AutoLinkNoteSource> loaded = noteSourcePort.findGraphAiNoteSources(
            userId,
            documentGroupId,
            maxNotes + 1
        );
        if (loaded.size() > maxNotes) {
            return new AutoLinkResult(
                userId,
                documentGroupId,
                NoteAutoLinkStrategy.LLM_ONLY,
                STATUS_LIMIT_EXCEEDED,
                true,
                maxNotes,
                loaded.size(),
                0,
                List.of(),
                new AutoLinkComparison(0, 0, 0)
            );
        }

        List<AutoLinkNoteSource> candidates = loaded.stream()
            .filter(note -> !sourceNoteId.equals(note.noteId()))
            .sorted(Comparator.comparing(AutoLinkNoteSource::noteId))
            .toList();
        AutoLinkStrategyResult strategy = runWithUsageCapture(
            NoteAutoLinkStrategy.LLM_ONLY,
            () -> analyzeLlmOnlySource(userId, modelId, source.get(), candidates)
        );
        int loadedNoteCount = candidates.size() + 1;
        return new AutoLinkResult(
            userId,
            documentGroupId,
            NoteAutoLinkStrategy.LLM_ONLY,
            STATUS_COMPLETED,
            false,
            maxNotes,
            loadedNoteCount,
            1,
            List.of(strategy),
            new AutoLinkComparison(0, 0, 0)
        );
    }

    private AutoLinkStrategyResult analyzeVectorLlm(
        String userId,
        String documentGroupId,
        String modelId,
        List<AutoLinkNoteSource> notes
    ) {
        Instant startedAt = Instant.now();
        Map<String, AutoLinkNoteSource> notesById = notesById(notes);
        List<AutoLinkSuggestion> suggestions = new ArrayList<>();
        int llmCalls = 0;
        int candidatePairCount = 0;
        int filteredInvalidAnchors = 0;
        int filteredQuality = 0;
        int filteredDuplicateTitles = 0;
        int filteredWeakRelations = 0;

        for (AutoLinkNoteSource source : notes) {
            List<VectorCandidate> candidates = vectorCandidates(userId, documentGroupId, source, notesById);
            candidatePairCount += candidates.size();
            if (candidates.isEmpty()) {
                continue;
            }
            AiChatResponse response = generate(
                modelId,
                VECTOR_FEATURE_ID,
                source.userId(),
                vectorSystemPrompt(),
                vectorUserPrompt(source, candidates)
            );
            if (response == null) {
                return emptyStrategyResult(NoteAutoLinkStrategy.VECTOR_LLM, STATUS_AI_UNAVAILABLE, modelId, notes.size(), startedAt);
            }
            llmCalls++;
            ValidatedSuggestions validated = validateSuggestions(
                NoteAutoLinkStrategy.VECTOR_LLM,
                source,
                notesById,
                modelId,
                parseLlmSuggestions(response.content()),
                candidatesByTarget(candidates)
            );
            suggestions.addAll(validated.suggestions());
            filteredInvalidAnchors += validated.filteredInvalidAnchorCount();
            filteredQuality += validated.filteredQualityCount();
            filteredDuplicateTitles += validated.filteredDuplicateTitleCount();
            filteredWeakRelations += validated.filteredWeakRelationCount();
        }
        RankedSuggestions ranked = rankSuggestions(suggestions);
        filteredQuality += ranked.filteredQualityCount();
        return strategyResult(
            NoteAutoLinkStrategy.VECTOR_LLM,
            STATUS_COMPLETED,
            modelId,
            notes.size(),
            llmCalls,
            candidatePairCount,
            filteredInvalidAnchors,
            filteredQuality,
            filteredDuplicateTitles,
            filteredWeakRelations,
            ranked.suggestions(),
            List.of(),
            startedAt
        );
    }

    private AutoLinkStrategyResult analyzeLlmOnly(String userId, String modelId, List<AutoLinkNoteSource> notes) {
        Instant startedAt = Instant.now();
        Map<String, AutoLinkNoteSource> notesById = notesById(notes);
        List<NoteCard> cards = notes.stream().map(NoteAutoLinkService::noteCard).toList();
        List<AutoLinkSuggestion> suggestions = new ArrayList<>();
        int llmCalls = 0;
        int filteredInvalidAnchors = 0;
        int filteredQuality = 0;
        int filteredDuplicateTitles = 0;
        int filteredWeakRelations = 0;

        for (AutoLinkNoteSource source : notes) {
            List<NoteCard> otherCards = cards.stream()
                .filter(card -> !card.noteId().equals(source.noteId()))
                .toList();
            if (otherCards.isEmpty()) {
                continue;
            }
            AiChatResponse response = generate(
                modelId,
                LLM_ONLY_FEATURE_ID,
                userId,
                llmOnlySystemPrompt(),
                llmOnlyUserPrompt(source, otherCards)
            );
            if (response == null) {
                return emptyStrategyResult(NoteAutoLinkStrategy.LLM_ONLY, STATUS_AI_UNAVAILABLE, modelId, notes.size(), startedAt);
            }
            llmCalls++;
            ValidatedSuggestions validated = validateSuggestions(
                NoteAutoLinkStrategy.LLM_ONLY,
                source,
                notesById,
                modelId,
                parseLlmSuggestions(response.content()),
                Map.of()
            );
            suggestions.addAll(validated.suggestions());
            filteredInvalidAnchors += validated.filteredInvalidAnchorCount();
            filteredQuality += validated.filteredQualityCount();
            filteredDuplicateTitles += validated.filteredDuplicateTitleCount();
            filteredWeakRelations += validated.filteredWeakRelationCount();
        }
        RankedSuggestions ranked = rankSuggestions(suggestions);
        filteredQuality += ranked.filteredQualityCount();
        return strategyResult(
            NoteAutoLinkStrategy.LLM_ONLY,
            STATUS_COMPLETED,
            modelId,
            notes.size(),
            llmCalls,
            Math.max(0, notes.size() * (notes.size() - 1)),
            filteredInvalidAnchors,
            filteredQuality,
            filteredDuplicateTitles,
            filteredWeakRelations,
            ranked.suggestions(),
            List.of(),
            startedAt
        );
    }

    private AutoLinkStrategyResult analyzeLlmOnlySource(
        String userId,
        String modelId,
        AutoLinkNoteSource source,
        List<AutoLinkNoteSource> candidates
    ) {
        Instant startedAt = Instant.now();
        List<AutoLinkNoteSource> notes = new ArrayList<>();
        notes.add(source);
        notes.addAll(candidates);
        Map<String, AutoLinkNoteSource> notesById = notesById(notes);
        List<NoteCard> candidateCards = candidates.stream().map(NoteAutoLinkService::noteCard).toList();
        if (candidateCards.isEmpty()) {
            return strategyResult(
                NoteAutoLinkStrategy.LLM_ONLY,
                STATUS_COMPLETED,
                modelId,
                1,
                0,
                0,
                0,
                0,
                0,
                0,
                List.of(),
                List.of(),
                startedAt
            );
        }

        AiChatResponse response = generate(
            modelId,
            LLM_ONLY_FEATURE_ID,
            userId,
            llmOnlySystemPrompt(),
            llmOnlyUserPrompt(source, candidateCards)
        );
        if (response == null) {
            return emptyStrategyResult(NoteAutoLinkStrategy.LLM_ONLY, STATUS_AI_UNAVAILABLE, modelId, 1, startedAt);
        }

        ValidatedSuggestions validated = validateSuggestions(
            NoteAutoLinkStrategy.LLM_ONLY,
            source,
            notesById,
            modelId,
            parseLlmSuggestions(response.content()),
            Map.of()
        );
        RankedSuggestions ranked = rankSuggestions(validated.suggestions());
        return strategyResult(
            NoteAutoLinkStrategy.LLM_ONLY,
            STATUS_COMPLETED,
            modelId,
            1,
            1,
            candidates.size(),
            validated.filteredInvalidAnchorCount(),
            validated.filteredQualityCount() + ranked.filteredQualityCount(),
            validated.filteredDuplicateTitleCount(),
            validated.filteredWeakRelationCount(),
            ranked.suggestions(),
            List.of(),
            startedAt
        );
    }

    private List<VectorCandidate> vectorCandidates(
        String userId,
        String documentGroupId,
        AutoLinkNoteSource source,
        Map<String, AutoLinkNoteSource> notesById
    ) {
        Map<String, VectorCandidate> bestByTarget = new LinkedHashMap<>();
        for (SourceWindow window : sourceWindows(source)) {
            List<NoteChunkSearchResult> hits = noteChunkRetrievalPort.searchChunks(new NoteChunkSearchQuery(
                userId,
                documentGroupId,
                source.title() + "\n\n" + window.text(),
                properties.getVectorTopK()
            ));
            for (NoteChunkSearchResult hit : hits) {
                if (hit.noteId().equals(source.noteId())
                    || hit.score() < properties.getMinVectorScore()
                    || !notesById.containsKey(hit.noteId())) {
                    continue;
                }
                VectorCandidate candidate = new VectorCandidate(
                    hit.noteId(),
                    notesById.get(hit.noteId()).title(),
                    hit.chunkId(),
                    hit.chunkIndex(),
                    hit.score(),
                    snippet(hit.text(), EVIDENCE_LIMIT)
                );
                VectorCandidate existing = bestByTarget.get(candidate.targetNoteId());
                if (existing == null || candidate.vectorScore() > existing.vectorScore()) {
                    bestByTarget.put(candidate.targetNoteId(), candidate);
                }
            }
        }
        return bestByTarget.values().stream()
            .sorted(Comparator.comparingDouble(VectorCandidate::vectorScore).reversed())
            .limit(Math.max(properties.getMaxSuggestionsPerNote() * 4L, properties.getMaxSuggestionsPerNote()))
            .toList();
    }

    private AiChatResponse generate(
        String modelId,
        String featureId,
        String userId,
        String systemPrompt,
        String userPrompt
    ) {
        try {
            String effectiveSystemPrompt = StylePromptCompiler.appendToSystemPrompt(
                systemPrompt,
                linkReasonFeature(featureId) ? stylePromptCompiler.conversationToneInstructions(userId) : ""
            );
            AiChatResponse response = aiChatPort.generate(new AiChatRequest(
                modelId,
                List.of(
                    new AiChatMessage(AiRole.SYSTEM, effectiveSystemPrompt),
                    new AiChatMessage(AiRole.USER, userPrompt)
                )
            ));
            recordChatUsage(userId, featureId, modelId, response == null ? null : response.tokenUsage());
            return response;
        } catch (IllegalStateException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("ChatClient.Builder bean is not configured")) {
                return null;
            }
            throw exception;
        }
    }

    private static boolean linkReasonFeature(String featureId) {
        return VECTOR_FEATURE_ID.equals(featureId) || LLM_ONLY_FEATURE_ID.equals(featureId);
    }

    private void recordChatUsage(String userId, String featureId, String modelId, AiTokenUsage tokenUsage) {
        aiUsageRecorder.recordChatUsage(userId, featureId, modelId, null, tokenUsage);
    }

    private ValidatedSuggestions validateSuggestions(
        NoteAutoLinkStrategy strategy,
        AutoLinkNoteSource source,
        Map<String, AutoLinkNoteSource> notesById,
        String modelId,
        List<AutoLinkLlmSuggestion> llmSuggestions,
        Map<String, VectorCandidate> vectorCandidatesByTarget
    ) {
        List<AutoLinkSuggestion> suggestions = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int filtered = 0;
        int filteredQuality = 0;
        int filteredDuplicateTitles = 0;
        int filteredWeakRelations = 0;
        for (AutoLinkLlmSuggestion llmSuggestion : llmSuggestions) {
            if (suggestions.size() >= properties.getMaxSuggestionsPerNote()) {
                break;
            }
            if (llmSuggestion.confidence() < properties.getMinConfidence()) {
                filteredQuality++;
                continue;
            }
            AutoLinkNoteSource target = notesById.get(llmSuggestion.targetNoteId());
            if (target == null || target.noteId().equals(source.noteId())) {
                filtered++;
                continue;
            }
            if (sameNormalizedTitle(source.title(), target.title())) {
                filteredDuplicateTitles++;
                continue;
            }
            VectorCandidate vectorCandidate = vectorCandidatesByTarget.get(target.noteId());
            if (strategy == NoteAutoLinkStrategy.VECTOR_LLM
                && (vectorCandidate == null || vectorCandidate.vectorScore() < properties.getVectorStrongScore())) {
                filteredQuality++;
                continue;
            }
            Optional<AnchorRange> anchor = anchorLocator.locate(source.markdown(), llmSuggestion.anchorText());
            if (anchor.isEmpty()) {
                filtered++;
                continue;
            }
            if (isLowQualityAnchor(anchor.get().matchedText())) {
                filteredQuality++;
                continue;
            }
            String evidence = evidence(strategy, target, vectorCandidate);
            if (isWeakRelation(strategy, source, target, anchor.get(), llmSuggestion, vectorCandidate, evidence, modelId)) {
                filteredWeakRelations++;
                continue;
            }
            String key = source.noteId() + "::" + target.noteId() + "::" + anchor.get().startOffset() + "::" + anchor.get().endOffset();
            if (!seen.add(key)) {
                filteredQuality++;
                continue;
            }
            suggestions.add(new AutoLinkSuggestion(
                UUID.randomUUID().toString(),
                source.noteId(),
                source.title(),
                target.noteId(),
                target.title(),
                anchor.get(),
                llmSuggestion.confidence(),
                vectorCandidate == null ? null : vectorCandidate.vectorScore(),
                llmSuggestion.reason(),
                evidence
            ));
        }
        return new ValidatedSuggestions(suggestions, filtered, filteredQuality, filteredDuplicateTitles, filteredWeakRelations);
    }

    private RankedSuggestions rankSuggestions(List<AutoLinkSuggestion> suggestions) {
        if (suggestions.isEmpty()) {
            return new RankedSuggestions(List.of(), 0);
        }
        List<AutoLinkSuggestion> ranked = suggestions.stream()
            .sorted(Comparator.comparingDouble(this::qualityScore).reversed())
            .toList();
        Map<String, Integer> sourceTargetCounts = new HashMap<>();
        Map<String, Integer> sourceCounts = new HashMap<>();
        Map<String, Integer> targetCounts = new HashMap<>();
        List<AutoLinkSuggestion> accepted = new ArrayList<>();
        int filteredQuality = 0;
        for (AutoLinkSuggestion suggestion : ranked) {
            String sourceTargetKey = suggestion.sourceNoteId() + "::" + suggestion.targetNoteId();
            if (sourceTargetCounts.getOrDefault(sourceTargetKey, 0) >= properties.getMaxSuggestionsPerSourceTarget()
                || sourceCounts.getOrDefault(suggestion.sourceNoteId(), 0) >= properties.getMaxSuggestionsPerNote()
                || targetCounts.getOrDefault(suggestion.targetNoteId(), 0) >= properties.getMaxSuggestionsPerTargetNote()) {
                filteredQuality++;
                continue;
            }
            sourceTargetCounts.merge(sourceTargetKey, 1, Integer::sum);
            sourceCounts.merge(suggestion.sourceNoteId(), 1, Integer::sum);
            targetCounts.merge(suggestion.targetNoteId(), 1, Integer::sum);
            accepted.add(suggestion);
        }
        return new RankedSuggestions(accepted, filteredQuality);
    }

    private double qualityScore(AutoLinkSuggestion suggestion) {
        double score = suggestion.confidence() * 100.0d;
        if (suggestion.vectorScore() != null) {
            score += suggestion.vectorScore() * 40.0d;
        }
        String anchorText = suggestion.anchor().matchedText().trim();
        if (anchorText.length() >= 20) {
            score += 12.0d;
        } else if (anchorText.length() >= 10) {
            score += 6.0d;
        }
        if (anchorText.matches(".*\\s+.*")) {
            score += 5.0d;
        }
        if (anchorText.length() <= 4) {
            score -= 10.0d;
        }
        return score;
    }

    private boolean isLowQualityAnchor(String anchorText) {
        String normalized = normalizeAnchorTerm(anchorText);
        if (!StringUtils.hasText(normalized)) {
            return true;
        }
        if (GENERIC_ANCHOR_TERMS.contains(normalized.toLowerCase(Locale.ROOT))) {
            return true;
        }
        int koreanChars = countKoreanChars(normalized);
        boolean hasKorean = koreanChars > 0;
        boolean singleTerm = !normalized.matches(".*\\s+.*");
        return hasKorean && singleTerm && koreanChars < properties.getMinAnchorKoreanChars();
    }

    private boolean isWeakRelation(
        NoteAutoLinkStrategy strategy,
        AutoLinkNoteSource source,
        AutoLinkNoteSource target,
        AnchorRange anchor,
        AutoLinkLlmSuggestion llmSuggestion,
        VectorCandidate vectorCandidate,
        String evidence,
        String modelId
    ) {
        RelationRuleDecision ruleDecision = relationRuleDecision(strategy, source, target, anchor, vectorCandidate, evidence);
        if (ruleDecision == RelationRuleDecision.WEAK) {
            return true;
        }
        if (ruleDecision == RelationRuleDecision.STRONG || !properties.isRelationVerifierEnabled()) {
            return false;
        }
        AutoLinkRelationVerification verification = verifyRelation(source, target, anchor, llmSuggestion, vectorCandidate, evidence, modelId);
        if (verification == null) {
            return false;
        }
        String relationType = verification.relationType().toUpperCase(Locale.ROOT);
        return WEAK_RELATION_TYPES.contains(relationType)
            || verification.confidence() < properties.getMinRelationConfidence();
    }

    private RelationRuleDecision relationRuleDecision(
        NoteAutoLinkStrategy strategy,
        AutoLinkNoteSource source,
        AutoLinkNoteSource target,
        AnchorRange anchor,
        VectorCandidate vectorCandidate,
        String evidence
    ) {
        Set<String> sourceTokens = contentTokens(sourceContext(source.markdown(), anchor));
        sourceTokens.addAll(contentTokens(anchor.matchedText()));
        Set<String> targetTokens = contentTokens(target.title() + " " + evidence);
        Set<String> overlap = new HashSet<>(sourceTokens);
        overlap.retainAll(targetTokens);
        Set<String> sourceTitleOverlap = contentTokens(source.title());
        sourceTitleOverlap.retainAll(targetTokens);
        Set<String> anchorOverlap = contentTokens(anchor.matchedText());
        anchorOverlap.retainAll(targetTokens);

        boolean broadTarget = containsAny(contentTokens(target.title()), BROAD_TARGET_TERMS);
        boolean vendorOnly = isVendorOnlyAnchor(anchor.matchedText(), overlap);
        boolean strongVector = vectorCandidate != null && vectorCandidate.vectorScore() >= 0.82d;

        if (vendorOnly) {
            return RelationRuleDecision.WEAK;
        }
        if (broadTarget && looksLikeFileOperationTitle(source.title())) {
            return RelationRuleDecision.WEAK;
        }
        if (overlap.size() >= 3 || strongVector && overlap.size() >= 2) {
            return RelationRuleDecision.STRONG;
        }
        if (broadTarget
            && sourceTitleOverlap.isEmpty()
            && anchorOverlap.size() <= 2
            && (vectorCandidate == null || vectorCandidate.vectorScore() < 0.75d)) {
            return RelationRuleDecision.WEAK;
        }
        if (broadTarget && overlap.size() <= 1) {
            return RelationRuleDecision.WEAK;
        }
        if (strategy == NoteAutoLinkStrategy.VECTOR_LLM && strongVector) {
            return RelationRuleDecision.STRONG;
        }
        return broadTarget || overlap.size() <= 1
            ? RelationRuleDecision.AMBIGUOUS
            : RelationRuleDecision.STRONG;
    }

    private AutoLinkRelationVerification verifyRelation(
        AutoLinkNoteSource source,
        AutoLinkNoteSource target,
        AnchorRange anchor,
        AutoLinkLlmSuggestion llmSuggestion,
        VectorCandidate vectorCandidate,
        String evidence,
        String modelId
    ) {
        AiChatResponse response = generate(
            modelId,
            RELATION_VERIFIER_FEATURE_ID,
            source.userId(),
            relationVerifierSystemPrompt(),
            relationVerifierUserPrompt(source, target, anchor, llmSuggestion, vectorCandidate, evidence)
        );
        return response == null ? null : jsonParser.parseRelationVerification(response.content());
    }

    private static boolean sameNormalizedTitle(String sourceTitle, String targetTitle) {
        String source = normalizeTitleForDuplicateCheck(sourceTitle);
        String target = normalizeTitleForDuplicateCheck(targetTitle);
        return StringUtils.hasText(source) && source.equals(target);
    }

    private static String normalizeTitleForDuplicateCheck(String title) {
        if (title == null) {
            return "";
        }
        return title
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\([^)]*\\)", "")
            .replaceAll("\\[[^]]*]", "")
            .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}\\uAC00-\\uD7A3]+", "")
            .trim();
    }

    private static String sourceContext(String markdown, AnchorRange anchor) {
        if (markdown == null || markdown.isBlank()) {
            return "";
        }
        int start = Math.max(0, anchor.startOffset() - ANCHOR_CONTEXT_RADIUS);
        int end = Math.min(markdown.length(), anchor.endOffset() + ANCHOR_CONTEXT_RADIUS);
        return markdown.substring(start, end);
    }

    private static Set<String> contentTokens(String value) {
        Set<String> tokens = new HashSet<>();
        if (value == null) {
            return tokens;
        }
        String[] parts = value.toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}\\uAC00-\\uD7A3]+", " ")
            .trim()
            .split("\\s+");
        for (String part : parts) {
            if (part.length() >= 2 && !TOKEN_STOP_WORDS.contains(part)) {
                tokens.add(part);
            }
        }
        return tokens;
    }

    private static boolean containsAny(Set<String> values, Set<String> expected) {
        for (String value : values) {
            if (expected.contains(value)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isVendorOnlyAnchor(String anchorText, Set<String> overlap) {
        Set<String> anchorTokens = contentTokens(anchorText);
        return anchorTokens.size() == 1
            && VENDOR_ONLY_TERMS.contains(anchorTokens.iterator().next())
            && overlap.size() <= 1;
    }

    private static boolean looksLikeFileOperationTitle(String title) {
        Set<String> titleTokens = contentTokens(title);
        return !titleTokens.isEmpty()
            && FILE_OPERATION_TITLE_TERMS.containsAll(titleTokens);
    }

    private static String normalizeAnchorTerm(String anchorText) {
        if (anchorText == null) {
            return "";
        }
        return anchorText
            .replaceAll("^[#>*\\-\\s]+", "")
            .replaceAll("[`*_\\[\\]()]", "")
            .trim();
    }

    private static int countKoreanChars(String value) {
        int count = 0;
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (current >= '\uAC00' && current <= '\uD7A3') {
                count++;
            }
        }
        return count;
    }

    private List<AutoLinkLlmSuggestion> parseLlmSuggestions(String content) {
        return jsonParser.parseLlmSuggestions(content);
    }

    private AutoLinkStrategyResult runWithUsageCapture(NoteAutoLinkStrategy strategy, StrategySupplier supplier) {
        AutoLinkUsageCapturePort capturePort = usageCapturePortProvider.getIfAvailable();
        if (capturePort != null) {
            capturePort.begin();
        }
        AutoLinkStrategyResult result;
        try {
            result = supplier.get();
        } catch (RuntimeException | Error exception) {
            if (capturePort != null) {
                capturePort.drain();
            }
            throw exception;
        }
        List<TokenUsageRecord> records = capturePort == null ? List.of() : capturePort.drain();
        return withUsageRecords(result, toUsageRecords(records));
    }

    private static AutoLinkStrategyResult withUsageRecords(
        AutoLinkStrategyResult result,
        List<AutoLinkUsageRecord> usageRecords
    ) {
        return new AutoLinkStrategyResult(
            result.strategy(),
            result.status(),
            result.modelId(),
            result.analyzedNoteCount(),
            result.llmCallCount(),
            result.candidatePairCount(),
            result.suggestionCount(),
            result.validAnchorCount(),
            result.filteredInvalidAnchorCount(),
            result.filteredQualityCount(),
            result.filteredDuplicateTitleCount(),
            result.filteredWeakRelationCount(),
            result.elapsedMs(),
            result.suggestions(),
            usageRecords,
            usageSummary(usageRecords)
        );
    }

    private AutoLinkStrategyResult strategyResult(
        NoteAutoLinkStrategy strategy,
        String status,
        String modelId,
        int analyzedNoteCount,
        int llmCallCount,
        int candidatePairCount,
        int filteredInvalidAnchors,
        int filteredQuality,
        int filteredDuplicateTitles,
        int filteredWeakRelations,
        List<AutoLinkSuggestion> suggestions,
        List<AutoLinkUsageRecord> usageRecords,
        Instant startedAt
    ) {
        return new AutoLinkStrategyResult(
            strategy,
            status,
            modelId,
            analyzedNoteCount,
            llmCallCount,
            candidatePairCount,
            suggestions.size(),
            suggestions.size(),
            filteredInvalidAnchors,
            filteredQuality,
            filteredDuplicateTitles,
            filteredWeakRelations,
            elapsedMs(startedAt),
            suggestions,
            usageRecords,
            usageSummary(usageRecords)
        );
    }

    private AutoLinkStrategyResult emptyStrategyResult(
        NoteAutoLinkStrategy strategy,
        String status,
        String modelId,
        int analyzedNoteCount,
        Instant startedAt
    ) {
        return strategyResult(strategy, status, modelId, analyzedNoteCount, 0, 0, 0, 0, 0, 0, List.of(), List.of(), startedAt);
    }

    private static AutoLinkComparison comparison(List<AutoLinkStrategyResult> results) {
        Set<String> vector = suggestionKeys(results, NoteAutoLinkStrategy.VECTOR_LLM);
        Set<String> llmOnly = suggestionKeys(results, NoteAutoLinkStrategy.LLM_ONLY);
        Set<String> overlap = new HashSet<>(vector);
        overlap.retainAll(llmOnly);
        return new AutoLinkComparison(
            overlap.size(),
            Math.max(0, vector.size() - overlap.size()),
            Math.max(0, llmOnly.size() - overlap.size())
        );
    }

    private static Set<String> suggestionKeys(List<AutoLinkStrategyResult> results, NoteAutoLinkStrategy strategy) {
        return results.stream()
            .filter(result -> result.strategy() == strategy)
            .findFirst()
            .map(result -> result.suggestions().stream()
                .map(NoteAutoLinkService::suggestionKey)
                .collect(java.util.stream.Collectors.toSet()))
            .orElseGet(Set::of);
    }

    private static String suggestionKey(AutoLinkSuggestion suggestion) {
        return suggestion.sourceNoteId()
            + "::" + suggestion.targetNoteId()
            + "::" + suggestion.anchor().startOffset()
            + "::" + suggestion.anchor().endOffset();
    }

    private static List<AutoLinkUsageRecord> toUsageRecords(List<TokenUsageRecord> records) {
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        return records.stream()
            .map(record -> new AutoLinkUsageRecord(
                record.featureId(),
                record.modelId(),
                record.inputTokens(),
                record.cachedInputTokens(),
                record.billableInputTokens(),
                record.outputTokens(),
                record.reasoningTokens(),
                record.totalTokens(),
                new AutoLinkCostEstimate(
                    record.estimatedInputCost(),
                    record.estimatedCachedInputCost(),
                    record.estimatedOutputCost(),
                    record.estimatedCost(),
                    record.costCurrency()
                )
            ))
            .toList();
    }

    private static AutoLinkUsageSummary usageSummary(List<AutoLinkUsageRecord> records) {
        if (records == null || records.isEmpty()) {
            return new AutoLinkUsageSummary(0, 0, 0, 0, 0, 0, new AutoLinkCostEstimate(null, null, null, null, null));
        }
        int inputTokens = records.stream().mapToInt(AutoLinkUsageRecord::inputTokens).sum();
        int cachedInputTokens = records.stream().mapToInt(AutoLinkUsageRecord::cachedInputTokens).sum();
        int billableInputTokens = records.stream().mapToInt(AutoLinkUsageRecord::billableInputTokens).sum();
        int outputTokens = records.stream().mapToInt(AutoLinkUsageRecord::outputTokens).sum();
        int reasoningTokens = records.stream().mapToInt(AutoLinkUsageRecord::reasoningTokens).sum();
        int totalTokens = records.stream().mapToInt(AutoLinkUsageRecord::totalTokens).sum();
        return new AutoLinkUsageSummary(
            inputTokens,
            cachedInputTokens,
            billableInputTokens,
            outputTokens,
            reasoningTokens,
            totalTokens,
            new AutoLinkCostEstimate(
                sumCost(records, record -> record.costEstimate().inputCost()),
                sumCost(records, record -> record.costEstimate().cachedInputCost()),
                sumCost(records, record -> record.costEstimate().outputCost()),
                sumCost(records, record -> record.costEstimate().totalCost()),
                commonCurrency(records)
            )
        );
    }

    private static BigDecimal sumCost(List<AutoLinkUsageRecord> records, CostGetter getter) {
        BigDecimal total = BigDecimal.ZERO;
        for (AutoLinkUsageRecord record : records) {
            BigDecimal value = getter.get(record);
            if (value == null) {
                return null;
            }
            total = total.add(value);
        }
        return total.stripTrailingZeros();
    }

    private static String commonCurrency(List<AutoLinkUsageRecord> records) {
        String currency = null;
        for (AutoLinkUsageRecord record : records) {
            String current = record.costEstimate().currencyCode();
            if (!StringUtils.hasText(current)) {
                return null;
            }
            if (currency == null) {
                currency = current;
            } else if (!currency.equals(current)) {
                return null;
            }
        }
        return currency;
    }

    private static String vectorSystemPrompt() {
        return """
            You find useful note links. Return only strict JSON.
            The JSON must be an array of objects with anchorText, targetNoteId, reason, confidence.
            anchorText must be copied exactly from the source markdown.
            Prefer specific headings or phrases over generic single nouns.
            Do not include markdown fences or commentary.
            """;
    }

    private static String llmOnlySystemPrompt() {
        return """
            You find useful note links by comparing one source note to note cards from the same document group.
            Return only strict JSON array. Each object must have anchorText, targetNoteId, reason, confidence.
            anchorText must be copied exactly from the source markdown.
            Prefer specific headings or phrases over generic single nouns.
            Do not include markdown fences or commentary.
            """;
    }

    private static String relationVerifierSystemPrompt() {
        return """
            You verify whether a proposed note link is useful.
            Return only strict JSON with relationType, confidence, reason.
            Allowed useful relationType values: DEFINES, EXPANDS, IMPLEMENTS, REFERENCES, PREREQUISITE, CONTRASTS.
            Reject weak values: BROAD_TOPIC, SAME_DOMAIN_ONLY, VENDOR_NAME_ONLY, WEAK_ANALOGY, UNRELATED.
            Prefer rejection when the target only shares a broad domain with the source.
            """;
    }

    private String vectorUserPrompt(AutoLinkNoteSource source, List<VectorCandidate> candidates) {
        StringBuilder builder = new StringBuilder();
        builder.append("Source note:\n");
        appendSource(builder, source);
        builder.append("\nVector candidate target notes:\n");
        for (VectorCandidate candidate : candidates) {
            builder.append("- targetNoteId: ").append(candidate.targetNoteId()).append('\n')
                .append("  targetTitle: ").append(candidate.targetTitle()).append('\n')
                .append("  vectorScore: ").append(candidate.vectorScore()).append('\n')
                .append("  evidence: ").append(candidate.evidence()).append("\n");
        }
        builder.append("\nReturn at most ").append(properties.getMaxSuggestionsPerNote()).append(" suggestions.");
        return builder.toString();
    }

    private String llmOnlyUserPrompt(AutoLinkNoteSource source, List<NoteCard> cards) {
        StringBuilder builder = new StringBuilder();
        builder.append("Source note:\n");
        appendSource(builder, source);
        builder.append("\nDocument group note cards:\n");
        for (NoteCard card : cards) {
            builder.append("- noteId: ").append(card.noteId()).append('\n')
                .append("  title: ").append(card.title()).append('\n')
                .append("  tags: ").append(card.tags()).append('\n')
                .append("  headings: ").append(card.headings()).append('\n')
                .append("  excerpt: ").append(card.excerpt()).append("\n");
        }
        builder.append("\nReturn at most ").append(properties.getMaxSuggestionsPerNote()).append(" suggestions.");
        return builder.toString();
    }

    private static String relationVerifierUserPrompt(
        AutoLinkNoteSource source,
        AutoLinkNoteSource target,
        AnchorRange anchor,
        AutoLinkLlmSuggestion llmSuggestion,
        VectorCandidate vectorCandidate,
        String evidence
    ) {
        StringBuilder builder = new StringBuilder();
        builder.append("Source note title: ").append(source.title()).append('\n')
            .append("Target note title: ").append(target.title()).append('\n')
            .append("Anchor text: ").append(anchor.matchedText()).append('\n')
            .append("Source context: ").append(snippet(normalizeWhitespace(sourceContext(source.markdown(), anchor)), EVIDENCE_LIMIT)).append('\n')
            .append("Target evidence: ").append(snippet(normalizeWhitespace(evidence), EVIDENCE_LIMIT)).append('\n')
            .append("Original reason: ").append(llmSuggestion.reason()).append('\n')
            .append("Original confidence: ").append(llmSuggestion.confidence()).append('\n');
        if (vectorCandidate != null) {
            builder.append("Vector score: ").append(vectorCandidate.vectorScore()).append('\n');
        }
        builder.append("Return JSON only.");
        return builder.toString();
    }

    private static void appendSource(StringBuilder builder, AutoLinkNoteSource source) {
        builder.append("noteId: ").append(source.noteId()).append('\n')
            .append("title: ").append(source.title()).append('\n')
            .append("tags: ").append(source.tags()).append('\n')
            .append("markdown:\n")
            .append(snippet(source.markdown(), SOURCE_MARKDOWN_PROMPT_LIMIT))
            .append('\n');
    }

    private List<SourceWindow> sourceWindows(AutoLinkNoteSource note) {
        String markdown = note.markdown() == null ? "" : note.markdown();
        if (markdown.isBlank()) {
            return List.of();
        }
        List<SourceWindow> windows = new ArrayList<>();
        int start = 0;
        while (start < markdown.length() && windows.size() < properties.getMaxSourceWindowsPerNote()) {
            int end = Math.min(markdown.length(), start + SOURCE_WINDOW_LENGTH);
            windows.add(new SourceWindow(start, end, markdown.substring(start, end)));
            if (end == markdown.length()) {
                break;
            }
            start = Math.max(start + 1, end - SOURCE_WINDOW_OVERLAP);
        }
        return windows;
    }

    private static Map<String, AutoLinkNoteSource> notesById(List<AutoLinkNoteSource> notes) {
        Map<String, AutoLinkNoteSource> values = new LinkedHashMap<>();
        for (AutoLinkNoteSource note : notes) {
            values.put(note.noteId(), note);
        }
        return values;
    }

    private static Map<String, VectorCandidate> candidatesByTarget(List<VectorCandidate> candidates) {
        return candidates.stream()
            .collect(java.util.stream.Collectors.toMap(
                VectorCandidate::targetNoteId,
                candidate -> candidate,
                (left, right) -> left.vectorScore() >= right.vectorScore() ? left : right,
                LinkedHashMap::new
            ));
    }

    private static NoteCard noteCard(AutoLinkNoteSource note) {
        return new NoteCard(
            note.noteId(),
            note.title(),
            note.tags(),
            headings(note.markdown()),
            snippet(normalizeWhitespace(note.markdown()), NOTE_CARD_EXCERPT_LIMIT)
        );
    }

    private static List<String> headings(String markdown) {
        if (!StringUtils.hasText(markdown)) {
            return List.of();
        }
        return markdown.lines()
            .map(String::trim)
            .filter(line -> line.startsWith("#"))
            .map(line -> line.replaceFirst("^#+", "").trim())
            .filter(StringUtils::hasText)
            .limit(8)
            .toList();
    }

    private static String evidence(
        NoteAutoLinkStrategy strategy,
        AutoLinkNoteSource target,
        VectorCandidate vectorCandidate
    ) {
        if (strategy == NoteAutoLinkStrategy.VECTOR_LLM && vectorCandidate != null) {
            return vectorCandidate.evidence();
        }
        return noteCard(target).excerpt();
    }

    private int normalizeMaxNotes(Integer maxNotes) {
        if (maxNotes == null || maxNotes <= 0) {
            return properties.getMaxNotes();
        }
        return maxNotes;
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static long elapsedMs(Instant startedAt) {
        return Math.max(0L, Duration.between(startedAt, Instant.now()).toMillis());
    }

    private static String snippet(String text, int limit) {
        if (text == null) {
            return "";
        }
        if (text.length() <= limit) {
            return text;
        }
        return text.substring(0, Math.max(0, limit)).trim();
    }

    private static String normalizeWhitespace(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\s+", " ").trim();
    }

    @FunctionalInterface
    private interface StrategySupplier {
        AutoLinkStrategyResult get();
    }

    @FunctionalInterface
    private interface CostGetter {
        BigDecimal get(AutoLinkUsageRecord record);
    }

    private record SourceWindow(int startOffset, int endOffset, String text) {
    }

    private record VectorCandidate(
        String targetNoteId,
        String targetTitle,
        String chunkId,
        int chunkIndex,
        double vectorScore,
        String evidence
    ) {
    }

    private record NoteCard(
        String noteId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt
    ) {
    }

    private record ValidatedSuggestions(
        List<AutoLinkSuggestion> suggestions,
        int filteredInvalidAnchorCount,
        int filteredQualityCount,
        int filteredDuplicateTitleCount,
        int filteredWeakRelationCount
    ) {
    }

    private record RankedSuggestions(
        List<AutoLinkSuggestion> suggestions,
        int filteredQualityCount
    ) {
    }

    private enum RelationRuleDecision {
        STRONG,
        AMBIGUOUS,
        WEAK
    }
}
