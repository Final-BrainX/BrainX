package com.brainx.intelligence.chat.application.usecase;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCitationView;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesCommand;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesResponse;
import com.brainx.intelligence.chat.application.port.inbound.AskNotesUseCase.AskNotesTokenUsageView;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiExecutionMetadata;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

@Service
public class McpRagAnswerService implements AskNotesUseCase {

    static final String MCP_RAG_ANSWER_FEATURE_ID = "mcp-rag-answer";
    private static final String PROMPT_KEY = "mcp-rag-answer";
    private static final String PROMPT_VERSION = "v1";
    private static final int PREFLIGHT_CONTEXT_CHARS_PER_CHUNK = 800;

    private final NoteChunkRetrievalPort noteChunkRetrievalPort;
    private final ChatEntitlementGuard entitlementGuard;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;

    public McpRagAnswerService(
        NoteChunkRetrievalPort noteChunkRetrievalPort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder
    ) {
        this.noteChunkRetrievalPort = noteChunkRetrievalPort;
        this.entitlementGuard = new ChatEntitlementGuard(entitlementPort);
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
    }

    @Override
    public AskNotesResponse askNotes(AskNotesCommand command) {
        String userId = requireText(command.userId(), "userId");
        String question = requireText(command.question(), "question");
        SearchScope scope = command.scope() == null ? SearchScope.USER : command.scope();
        String documentGroupId = normalizeDocumentGroupId(scope, command.documentGroupId());
        int limit = NoteChunkSearchQuery.normalizeTopK(command.limit() == null ? 0 : command.limit());
        String modelId = resolveModelId(userId, command.modelId());
        entitlementGuard.checkRagChat(userId, preflightTokenEstimate(question, limit));

        List<NoteChunkSearchResult> chunks = noteChunkRetrievalPort.searchChunks(new NoteChunkSearchQuery(
            userId,
            scope,
            documentGroupId,
            question,
            limit
        ));
        List<AskNotesCitationView> citations = citations(chunks, limit);
        if (citations.isEmpty()) {
            return new AskNotesResponse(
                "No relevant BrainX notes were found for this question.",
                List.of(),
                null,
                0,
                false,
                null
            );
        }

        String systemPrompt = systemPrompt();
        String userPrompt = userPrompt(question, chunks);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        entitlementGuard.checkRagChat(userId, tokenEstimate);

        String answerId = UUID.randomUUID().toString();
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, systemPrompt),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        var response = aiChatPort.generate(new AiChatRequest(
            modelId,
            messages,
            new AiExecutionMetadata(
                userId,
                MCP_RAG_ANSWER_FEATURE_ID,
                PROMPT_KEY,
                PROMPT_VERSION,
                "MCP_RAG_ANSWER",
                answerId,
                Map.of("scope", scope.name())
            )
        ));
        AiTokenUsage tokenUsage = response == null ? null : response.tokenUsage();
        aiUsageRecorder.recordChatUsage(userId, MCP_RAG_ANSWER_FEATURE_ID, modelId, answerId, tokenUsage);

        return new AskNotesResponse(
            response == null || response.content() == null ? "" : response.content(),
            citations,
            modelId,
            tokenEstimate,
            true,
            toTokenUsageView(tokenUsage)
        );
    }

    private String resolveModelId(String userId, String requestedModelId) {
        if (StringUtils.hasText(requestedModelId)) {
            return requestedModelId.trim();
        }
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseThrow(() -> new ChatDomainException("modelId is required because no default AI model is configured."));
    }

    private static List<AskNotesCitationView> citations(List<NoteChunkSearchResult> chunks, int limit) {
        Map<String, AskNotesCitationView> bestByNoteId = new LinkedHashMap<>();
        for (NoteChunkSearchResult chunk : chunks == null ? List.<NoteChunkSearchResult>of() : chunks) {
            AskNotesCitationView citation = new AskNotesCitationView(
                chunk.noteId(),
                chunk.title(),
                excerpt(chunk.text()),
                chunk.score(),
                SearchMatchType.SEMANTIC
            );
            AskNotesCitationView existing = bestByNoteId.get(citation.noteId());
            if (existing == null || citation.score() > existing.score()) {
                bestByNoteId.put(citation.noteId(), citation);
            }
        }
        return bestByNoteId.values().stream()
            .limit(limit)
            .toList();
    }

    private static String userPrompt(String question, List<NoteChunkSearchResult> chunks) {
        StringBuilder builder = new StringBuilder();
        builder.append("Question:\n").append(question).append("\n\n");
        builder.append("BrainX note excerpts:\n");
        int index = 1;
        for (NoteChunkSearchResult chunk : chunks) {
            builder.append('[').append(index++).append("] ")
                .append(blankToMarker(chunk.title()))
                .append(" (noteId: ").append(chunk.noteId()).append(")\n")
                .append(excerpt(chunk.text()))
                .append("\n\n");
        }
        return builder.toString();
    }

    private static String systemPrompt() {
        return """
            You answer questions using only the provided BrainX note excerpts.
            If the excerpts do not contain enough information, say that the notes do not provide enough evidence.
            Answer in the same language as the user's question when possible.
            Be concise, preserve important nuance, and avoid inventing facts outside the excerpts.
            """;
    }

    private static String normalizeDocumentGroupId(SearchScope scope, String documentGroupId) {
        if (scope == SearchScope.USER) {
            if (StringUtils.hasText(documentGroupId)) {
                throw new ChatDomainException("documentGroupId must be omitted when scope is USER.");
            }
            return null;
        }
        return documentGroupId;
    }

    private static AskNotesTokenUsageView toTokenUsageView(AiTokenUsage tokenUsage) {
        if (tokenUsage == null) {
            return null;
        }
        return new AskNotesTokenUsageView(
            tokenUsage.promptTokens(),
            tokenUsage.completionTokens(),
            tokenUsage.totalTokens(),
            tokenUsage.cachedPromptTokens(),
            tokenUsage.reasoningTokens()
        );
    }

    private static String excerpt(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        String normalized = text
            .replaceAll("(?s)```.*?```", " ")
            .replaceAll("[#>`*_\\[\\]()]", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (normalized.length() <= 700) {
            return normalized;
        }
        return normalized.substring(0, 700).trim();
    }

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (safeText.length() + 3) / 4);
    }

    private static int preflightTokenEstimate(String question, int limit) {
        int promptChars = systemPrompt().length()
            + "Question:\n".length()
            + (question == null ? 0 : question.length())
            + "\n\nBrainX note excerpts:\n".length()
            + (limit * PREFLIGHT_CONTEXT_CHARS_PER_CHUNK);
        return Math.max(1, (promptChars + 3) / 4);
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new ChatDomainException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static String blankToMarker(String value) {
        return StringUtils.hasText(value) ? value : "(untitled)";
    }
}
