package com.brainx.intelligence.autolink.application.port.inbound;

import java.math.BigDecimal;
import java.util.List;

import com.brainx.intelligence.autolink.domain.MarkdownAnchorLocator.AnchorRange;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;

public interface NoteAutoLinkUseCase {

    AutoLinkResult analyze(AutoLinkCommand command);

    AutoLinkResult analyzeSourceLinks(AutoLinkSourceCommand command);

    record AutoLinkCommand(
        String userId,
        String documentGroupId,
        NoteAutoLinkStrategy strategy,
        Integer maxNotes,
        String modelId
    ) {
    }

    record AutoLinkSourceCommand(
        String userId,
        String documentGroupId,
        String sourceNoteId,
        Integer maxNotes,
        String modelId
    ) {
    }

    record AutoLinkResult(
        String userId,
        String documentGroupId,
        NoteAutoLinkStrategy requestedStrategy,
        String status,
        boolean limitExceeded,
        int maxNotes,
        int loadedNoteCount,
        int analyzedNoteCount,
        List<AutoLinkStrategyResult> strategies,
        AutoLinkComparison comparison
    ) {
    }

    record AutoLinkStrategyResult(
        NoteAutoLinkStrategy strategy,
        String status,
        String modelId,
        int analyzedNoteCount,
        int llmCallCount,
        int candidatePairCount,
        int suggestionCount,
        int validAnchorCount,
        int filteredInvalidAnchorCount,
        int filteredQualityCount,
        int filteredDuplicateTitleCount,
        int filteredWeakRelationCount,
        long elapsedMs,
        List<AutoLinkSuggestion> suggestions,
        List<AutoLinkUsageRecord> usageRecords,
        AutoLinkUsageSummary usageSummary
    ) {
    }

    record AutoLinkSuggestion(
        String suggestionId,
        String sourceNoteId,
        String sourceTitle,
        String targetNoteId,
        String targetTitle,
        AnchorRange anchor,
        double confidence,
        Double vectorScore,
        String reason,
        String evidence
    ) {
    }

    record AutoLinkComparison(
        int overlapSuggestions,
        int onlyInVector,
        int onlyInLlmOnly
    ) {
    }

    record AutoLinkUsageRecord(
        String featureId,
        String modelId,
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        AutoLinkCostEstimate costEstimate
    ) {
    }

    record AutoLinkUsageSummary(
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        AutoLinkCostEstimate costEstimate
    ) {
    }

    record AutoLinkCostEstimate(
        BigDecimal inputCost,
        BigDecimal cachedInputCost,
        BigDecimal outputCost,
        BigDecimal totalCost,
        String currencyCode
    ) {
    }
}
