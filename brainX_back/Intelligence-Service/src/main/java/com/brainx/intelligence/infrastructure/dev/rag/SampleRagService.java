package com.brainx.intelligence.infrastructure.dev.rag;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.infrastructure.events.note.MarkdownNoteChunker;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;

@Service
public class SampleRagService {

    private static final int CONTEXT_SNIPPET_LENGTH = 1_200;
    private static final String RETRIEVAL_ONLY_MODEL = "none";
    private static final String SOURCE_SERVICE = "AI-Service";
    private static final String RAG_CHAT_FEATURE_ID = "sample-rag-chat";

    private final SampleRagProperties properties;
    private final SampleNoteLoader sampleNoteLoader;
    private final NoteProjectionStore noteProjectionStore;
    private final MarkdownNoteChunker noteChunker;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteChunkRetrievalPort noteChunkRetrievalPort;
    private final ObjectProvider<AiChatPort> aiChatPortProvider;
    private final TokenUsagePort tokenUsagePort;
    private final AiTokenUsageCostEstimator usageCostEstimator;
    private final ObjectProvider<SampleRagTokenUsageRecorder> usageRecorderProvider;

    public SampleRagService(
        SampleRagProperties properties,
        SampleNoteLoader sampleNoteLoader,
        NoteProjectionStore noteProjectionStore,
        MarkdownNoteChunker noteChunker,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteChunkRetrievalPort noteChunkRetrievalPort,
        ObjectProvider<AiChatPort> aiChatPortProvider,
        TokenUsagePort tokenUsagePort,
        AiTokenUsageCostEstimator usageCostEstimator,
        ObjectProvider<SampleRagTokenUsageRecorder> usageRecorderProvider
    ) {
        this.properties = properties;
        this.sampleNoteLoader = sampleNoteLoader;
        this.noteProjectionStore = noteProjectionStore;
        this.noteChunker = noteChunker;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteChunkRetrievalPort = noteChunkRetrievalPort;
        this.aiChatPortProvider = aiChatPortProvider;
        this.tokenUsagePort = tokenUsagePort;
        this.usageCostEstimator = usageCostEstimator;
        this.usageRecorderProvider = usageRecorderProvider;
    }

    public SampleRagIngestionResult ingest() {
        List<SampleNoteLoader.SampleNoteSnapshot> snapshots = sampleNoteLoader.load(properties);
        int chunkCount = 0;
        for (SampleNoteLoader.SampleNoteSnapshot snapshot : snapshots) {
            List<String> tags = normalizedTags();
            var projection = new NoteProjection(
                snapshot.userId(),
                snapshot.documentGroupId(),
                snapshot.noteId(),
                snapshot.title(),
                properties.getFolderId(),
                tags,
                1,
                snapshot.markdownHash(),
                false,
                false,
                false,
                false,
                "sample-notes:" + snapshot.markdownHash().substring(0, 16),
                snapshot.updatedAt() == null ? Instant.now() : snapshot.updatedAt()
            );
            var chunks = noteChunker.chunk(
                snapshot.userId(),
                snapshot.documentGroupId(),
                snapshot.noteId(),
                snapshot.title(),
                snapshot.markdown(),
                tags,
                snapshot.markdownHash(),
                projection.version(),
                snapshot.relativePath(),
                snapshot.filename()
            );
            boolean indexed = noteSearchIndexPort.replaceNoteChunks(
                snapshot.userId(),
                snapshot.documentGroupId(),
                snapshot.noteId(),
                chunks
            );
            noteProjectionStore.save(indexed
                ? projection.indexed(projection.version(), projection.markdownHash(), Instant.now())
                : projection);
            chunkCount += chunks.size();
        }
        return new SampleRagIngestionResult(
            properties.getDirectory().toString(),
            properties.getUserId(),
            snapshots.size(),
            chunkCount
        );
    }

    public SampleRagQueryResponse ask(String query) {
        if (!StringUtils.hasText(query)) {
            throw new IllegalArgumentException("query must not be blank.");
        }
        SampleRagTokenUsageRecorder usageRecorder = usageRecorderProvider.getIfAvailable();
        if (usageRecorder != null) {
            usageRecorder.begin();
        }
        try {
            return withUsageRecords(doAsk(query), usageRecorder);
        } catch (RuntimeException | Error exception) {
            if (usageRecorder != null) {
                usageRecorder.drain();
            }
            throw exception;
        }
    }

    private SampleRagQueryResponse doAsk(String query) {
        List<SampleRagContext> contexts = noteChunkRetrievalPort.searchChunks(new NoteChunkSearchQuery(
            properties.getUserId(),
            properties.getDocumentGroupId(),
            query,
                retrievalTopK()
            )).stream()
            .filter(result -> result.score() >= properties.getMinScore())
            .map(SampleRagService::toContext)
            .filter(new PerNoteChunkLimit(properties.getMaxChunksPerNote())::allow)
            .limit(contextLimit())
            .toList();

        if (contexts.isEmpty()) {
            return retrievalOnly(query, contexts, "관련 sample note chunk를 찾지 못했습니다.");
        }

        AiChatPort aiChatPort = aiChatPortProvider.getIfAvailable();
        if (aiChatPort == null) {
            return retrievalOnly(query, contexts, retrievalOnlyAnswer(contexts));
        }

        try {
            var response = aiChatPort.generate(new AiChatRequest(
                properties.getChatModel(),
                List.of(
                    new AiChatMessage(AiRole.SYSTEM, systemPrompt()),
                    new AiChatMessage(AiRole.USER, userPrompt(query, contexts))
                )
            ));
            SampleRagTokenUsage tokenUsage = toTokenUsage(response.tokenUsage());
            recordLlmTokenUsage(tokenUsage);
            return new SampleRagQueryResponse(
                query,
                "llm",
                properties.getChatModel(),
                response.content(),
                tokenUsage,
                List.of(),
                contexts
            );
        } catch (IllegalStateException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("ChatClient.Builder bean is not configured")) {
                return retrievalOnly(query, contexts, retrievalOnlyAnswer(contexts));
            }
            throw exception;
        }
    }

    private static SampleRagQueryResponse withUsageRecords(
        SampleRagQueryResponse response,
        SampleRagTokenUsageRecorder usageRecorder
    ) {
        if (usageRecorder == null) {
            return response;
        }
        return response.withUsageRecords(toUsageRecords(usageRecorder.drain()));
    }

    private static List<SampleRagUsageRecord> toUsageRecords(List<TokenUsageRecord> records) {
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        return records.stream()
            .map(record -> new SampleRagUsageRecord(
                record.featureId(),
                record.modelId(),
                record.inputTokens(),
                record.cachedInputTokens(),
                record.billableInputTokens(),
                record.outputTokens(),
                record.reasoningTokens(),
                record.totalTokens(),
                new SampleRagCostEstimate(
                    record.estimatedInputCost(),
                    record.estimatedCachedInputCost(),
                    record.estimatedOutputCost(),
                    record.estimatedCost(),
                    record.costCurrency()
                )
            ))
            .toList();
    }

    private SampleRagTokenUsage toTokenUsage(AiTokenUsage tokenUsage) {
        if (tokenUsage == null || !tokenUsage.hasKnownTokens()) {
            return null;
        }
        int inputTokens = tokenCount(tokenUsage.promptTokens());
        int cachedInputTokens = tokenCount(tokenUsage.cachedPromptTokens());
        int billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
        int outputTokens = tokenCount(tokenUsage.completionTokens());
        int reasoningTokens = tokenCount(tokenUsage.reasoningTokens());
        int totalTokens = tokenUsage.totalTokens() == null
            ? inputTokens + outputTokens
            : Math.max(0, tokenUsage.totalTokens());
        TokenCostEstimate cost = usageCostEstimator.estimate(
            properties.getChatModel(),
            inputTokens,
            cachedInputTokens,
            outputTokens
        );
        return new SampleRagTokenUsage(
            inputTokens,
            cachedInputTokens,
            billableInputTokens,
            outputTokens,
            reasoningTokens,
            totalTokens,
            toCostEstimate(cost)
        );
    }

    private static SampleRagCostEstimate toCostEstimate(TokenCostEstimate cost) {
        return new SampleRagCostEstimate(
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode()
        );
    }

    private void recordLlmTokenUsage(SampleRagTokenUsage tokenUsage) {
        if (tokenUsage == null) {
            return;
        }
        SampleRagCostEstimate cost = tokenUsage.costEstimate();
        tokenUsagePort.recordTokenUsage(new TokenUsageRecord(
            UUID.randomUUID().toString(),
            properties.getUserId(),
            SOURCE_SERVICE,
            RAG_CHAT_FEATURE_ID,
            properties.getChatModel(),
            tokenUsage.inputTokens(),
            tokenUsage.cachedInputTokens(),
            tokenUsage.billableInputTokens(),
            tokenUsage.outputTokens(),
            tokenUsage.reasoningTokens(),
            tokenUsage.totalTokens(),
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode(),
            UUID.randomUUID().toString()
        ));
    }

    private static int tokenCount(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private List<String> normalizedTags() {
        List<String> tags = properties.getTags() == null ? List.of() : properties.getTags();
        return tags.stream()
            .filter(StringUtils::hasText)
            .distinct()
            .toList();
    }

    private SampleRagQueryResponse retrievalOnly(String query, List<SampleRagContext> contexts, String answer) {
        return new SampleRagQueryResponse(query, "retrieval", RETRIEVAL_ONLY_MODEL, answer, null, List.of(), contexts);
    }

    private static SampleRagContext toContext(NoteChunkSearchResult result) {
        return new SampleRagContext(
            result.noteId(),
            result.documentGroupId(),
            result.chunkId(),
            result.chunkIndex(),
            result.title(),
            result.sourcePath(),
            result.sourceFilename(),
            result.score(),
            snippet(result.text())
        );
    }

    private static String snippet(String text) {
        if (text == null || text.length() <= CONTEXT_SNIPPET_LENGTH) {
            return text == null ? "" : text;
        }
        return text.substring(0, CONTEXT_SNIPPET_LENGTH).trim();
    }

    private static String retrievalOnlyAnswer(List<SampleRagContext> contexts) {
        return "ChatModel이 설정되지 않아 생성 답변은 생략했습니다. 상위 근거 chunk "
            + contexts.size()
            + "개를 확인하세요.";
    }

    private static String systemPrompt() {
        return """
            너는 BrainX sample_notes RAG 품질 검증용 챗봇이다.
            제공된 context만 근거로 한국어로 답변한다.
            context에 없는 내용은 추측하지 말고 모른다고 답한다.
            답변 끝에 참고한 note title과 chunk index를 짧게 적는다.
            """;
    }

    private String userPrompt(String query, List<SampleRagContext> contexts) {
        StringBuilder builder = new StringBuilder();
        builder.append("질문:\n").append(query).append("\n\nContext:\n");
        int remainingChars = Math.max(1_000, properties.getMaxContextChars());
        for (int index = 0; index < contexts.size() && remainingChars > 0; index++) {
            SampleRagContext context = contexts.get(index);
            String header = "[" + (index + 1) + "] title=" + context.title()
                + ", noteId=" + context.noteId()
                + ", chunkIndex=" + context.chunkIndex()
                + sourceLabel(context)
                + ", score=" + context.score()
                + "\n";
            String text = context.text();
            int allowed = Math.max(0, remainingChars - header.length() - 2);
            if (text.length() > allowed) {
                text = text.substring(0, allowed).trim();
            }
            builder.append(header).append(text).append("\n\n");
            remainingChars -= header.length() + text.length() + 2;
        }
        return builder.toString();
    }

    private int contextLimit() {
        return NoteChunkSearchQuery.normalizeTopK(properties.getTopK());
    }

    private int retrievalTopK() {
        return NoteChunkSearchQuery.normalizeTopK(contextLimit() * Math.max(1, properties.getMaxChunksPerNote()));
    }

    private static String sourceLabel(SampleRagContext context) {
        if (StringUtils.hasText(context.sourcePath())) {
            return ", sourcePath=" + context.sourcePath();
        }
        if (StringUtils.hasText(context.sourceFilename())) {
            return ", sourceFilename=" + context.sourceFilename();
        }
        return "";
    }

    private static final class PerNoteChunkLimit {

        private final int maxChunksPerNote;
        private final Map<String, Integer> counts = new LinkedHashMap<>();

        private PerNoteChunkLimit(int maxChunksPerNote) {
            this.maxChunksPerNote = Math.max(1, maxChunksPerNote);
        }

        private boolean allow(SampleRagContext context) {
            int current = counts.getOrDefault(context.noteId(), 0);
            if (current >= maxChunksPerNote) {
                return false;
            }
            counts.put(context.noteId(), current + 1);
            return true;
        }
    }

    public record SampleRagIngestionResult(
        String directory,
        String userId,
        int notesIndexed,
        int chunksIndexed
    ) {
    }

    public record SampleRagQueryResponse(
        String query,
        String answerMode,
        String model,
        String answer,
        SampleRagTokenUsage tokenUsage,
        List<SampleRagUsageRecord> usageRecords,
        List<SampleRagContext> contexts
    ) {
        public SampleRagQueryResponse {
            usageRecords = usageRecords == null ? List.of() : List.copyOf(usageRecords);
            contexts = contexts == null ? List.of() : List.copyOf(contexts);
        }

        SampleRagQueryResponse withUsageRecords(List<SampleRagUsageRecord> usageRecords) {
            return new SampleRagQueryResponse(query, answerMode, model, answer, tokenUsage, usageRecords, contexts);
        }
    }

    public record SampleRagTokenUsage(
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        SampleRagCostEstimate costEstimate
    ) {
    }

    public record SampleRagCostEstimate(
        BigDecimal inputCost,
        BigDecimal cachedInputCost,
        BigDecimal outputCost,
        BigDecimal totalCost,
        String currencyCode
    ) {
    }

    public record SampleRagUsageRecord(
        String featureId,
        String model,
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        SampleRagCostEstimate costEstimate
    ) {
    }

    public record SampleRagContext(
        String noteId,
        String documentGroupId,
        String chunkId,
        int chunkIndex,
        String title,
        String sourcePath,
        String sourceFilename,
        double score,
        String text
    ) {
    }
}
