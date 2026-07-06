package com.brainx.intelligence.connection.application.usecase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSourceCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkStrategyResult;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptRecommendation;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsResult;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.BridgeConceptCreatedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionEventPort.LinkSuggestionCreatedEvent;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort.ConnectionBridgeSourceNote;
import com.brainx.intelligence.connection.domain.ConnectionConflictException;
import com.brainx.intelligence.connection.domain.ConnectionForbiddenException;
import com.brainx.intelligence.connection.domain.ConnectionNotFoundException;
import com.brainx.intelligence.connection.domain.ConnectionProviderUnavailableException;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ConnectionService implements CreateLinkSuggestionsUseCase, CreateBridgeConceptsUseCase {

    static final String LINK_SUGGESTIONS_CAPABILITY = "LINK_SUGGESTIONS";
    static final String LINK_SUGGESTIONS_FEATURE_ID = "link-suggestions";
    static final String BRIDGE_CONCEPTS_FEATURE_ID = "bridge-concepts";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_LIMIT_EXCEEDED = "LIMIT_EXCEEDED";
    private static final String STATUS_AI_UNAVAILABLE = "AI_UNAVAILABLE";
    private static final int MIN_BRIDGE_NOTE_COUNT = 2;
    private static final int MAX_BRIDGE_NOTE_COUNT = 10;

    private final ConnectionNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final NoteAutoLinkUseCase noteAutoLinkUseCase;
    private final ConnectionEventPort connectionEventPort;
    private final ConnectionBridgeProperties bridgeProperties;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final StylePromptCompiler stylePromptCompiler;
    private final ObjectMapper objectMapper;

    public ConnectionService(
        ConnectionNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        NoteAutoLinkUseCase noteAutoLinkUseCase,
        ConnectionEventPort connectionEventPort,
        ConnectionBridgeProperties bridgeProperties,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        StylePromptCompiler stylePromptCompiler,
        ObjectMapper objectMapper
    ) {
        this.noteSourcePort = noteSourcePort;
        this.entitlementPort = entitlementPort;
        this.noteAutoLinkUseCase = noteAutoLinkUseCase;
        this.connectionEventPort = connectionEventPort;
        this.bridgeProperties = bridgeProperties;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.stylePromptCompiler = stylePromptCompiler;
        this.objectMapper = objectMapper;
    }

    @Override
    public LinkSuggestionsResult createLinkSuggestions(LinkSuggestionsCommand command) {
        String userId = requireText(command.userId(), "userId");
        String noteId = requireText(command.noteId(), "noteId");
        String documentGroupId = DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID;

        noteSourcePort.findLinkSuggestionSourceNote(userId, documentGroupId, noteId)
            .orElseThrow(() -> new ConnectionNotFoundException("Note is not available for link suggestions: " + noteId));

        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            LINK_SUGGESTIONS_CAPABILITY,
            null
        ));
        if (!entitlement.allowed()) {
            throw new ConnectionForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }

        AutoLinkResult result = noteAutoLinkUseCase.analyzeSourceLinks(new AutoLinkSourceCommand(
            userId,
            documentGroupId,
            noteId,
            null,
            null
        ));
        if (result.limitExceeded() || STATUS_LIMIT_EXCEEDED.equals(result.status())) {
            throw new ConnectionConflictException("Link suggestion note limit exceeded.");
        }

        AutoLinkStrategyResult strategy = linkSuggestionStrategy(result);
        if (strategy == null) {
            return new LinkSuggestionsResult(List.of());
        }
        if (STATUS_AI_UNAVAILABLE.equals(strategy.status())) {
            throw new ConnectionProviderUnavailableException("AI provider is unavailable for link suggestions.");
        }
        if (!STATUS_COMPLETED.equals(strategy.status())) {
            return new LinkSuggestionsResult(List.of());
        }

        List<LinkSuggestionResult> suggestions = strategy.suggestions().stream()
            .filter(suggestion -> noteId.equals(suggestion.sourceNoteId()))
            .map(suggestion -> {
                var anchor = suggestion.anchor();
                return new LinkSuggestionResult(
                    suggestion.suggestionId(),
                    suggestion.targetNoteId(),
                    suggestion.targetTitle(),
                    suggestion.confidence(),
                    suggestion.reason(),
                    anchor == null ? "" : anchor.matchedText(),
                    anchor == null ? -1 : anchor.startOffset(),
                    anchor == null ? -1 : anchor.endOffset()
                );
            })
            .toList();
        suggestions.forEach(suggestion -> connectionEventPort.linkSuggestionCreated(new LinkSuggestionCreatedEvent(
            userId,
            suggestion.suggestionId(),
            LINK_SUGGESTIONS_FEATURE_ID,
            noteId,
            strategy.modelId()
        )));
        return new LinkSuggestionsResult(suggestions);
    }

    @Override
    public BridgeConceptsResult createBridgeConcepts(BridgeConceptsCommand command) {
        String userId = requireText(command.userId(), "userId");
        List<String> noteIds = normalizeBridgeNoteIds(command.noteIds());
        String documentGroupId = DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID;
        List<ConnectionBridgeSourceNote> sourceNotes = bridgeSourceNotes(userId, documentGroupId, noteIds);
        String modelId = resolveBridgeModelId(userId);
        int maxRecommendations = bridgeProperties.getMaxRecommendations();
        List<String> bridgeLinkTitles = bridgeLinkTitles(sourceNotes);
        PromptResolution promptResolution = promptRegistryService.resolve("connection.bridge", bridgeSystemPrompt());
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                promptResolution.content(),
                bridgeRuntimeInstructions(maxRecommendations)
            ),
            stylePromptCompiler.conversationToneInstructions(userId)
        );
        String userPrompt = bridgeUserPrompt(sourceNotes, bridgeLinkTitles, maxRecommendations);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);

        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            LINK_SUGGESTIONS_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ConnectionForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }

        String requestId = UUID.randomUUID().toString();
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, systemPrompt),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        var recorded = generateBridge(
            userId,
            modelId,
            requestId,
            promptResolution,
            messages,
            Map.of("noteIds", noteIds)
        );
        AiChatResponse response = recorded.response();
        String content = response == null || response.content() == null ? "" : response.content();
        recordBridgeUsage(userId, modelId, requestId, response == null ? null : response.tokenUsage());
        List<BridgeConceptRecommendation> recommendations = bridgeRecommendations(
            userId,
            noteIds,
            bridgeLinkTitles,
            content,
            maxRecommendations
        );
        recommendations.forEach(recommendation -> connectionEventPort.bridgeConceptCreated(new BridgeConceptCreatedEvent(
            userId,
            recommendation.noteId(),
            BRIDGE_CONCEPTS_FEATURE_ID,
            null,
            modelId
        )));
        return new BridgeConceptsResult(recorded.llmRunId(), recommendations);
    }

    private List<ConnectionBridgeSourceNote> bridgeSourceNotes(String userId, String documentGroupId, List<String> noteIds) {
        List<ConnectionBridgeSourceNote> sourceNotes = noteSourcePort.findBridgeSourceNotes(userId, documentGroupId, noteIds);
        Map<String, ConnectionBridgeSourceNote> notesById = new LinkedHashMap<>();
        for (ConnectionBridgeSourceNote note : sourceNotes) {
            notesById.putIfAbsent(note.noteId(), note);
        }
        List<String> missingNoteIds = noteIds.stream()
            .filter(noteId -> !notesById.containsKey(noteId))
            .toList();
        if (!missingNoteIds.isEmpty()) {
            throw new ConnectionNotFoundException("Bridge source notes are not available: " + String.join(", ", missingNoteIds));
        }
        return noteIds.stream()
            .map(notesById::get)
            .toList();
    }

    private String resolveBridgeModelId(String userId) {
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseGet(() -> requireText(bridgeProperties.getDefaultModel(), "brainx.connection.bridge.default-model"));
    }

    private AiRunRecorder.RecordedChatResponse generateBridge(
        String userId,
        String modelId,
        String requestId,
        PromptResolution promptResolution,
        List<AiChatMessage> messages,
        Map<String, Object> metadata
    ) {
        try {
            return aiRunRecorder.recordChatGenerateWithRun(
                userId,
                BRIDGE_CONCEPTS_FEATURE_ID,
                promptResolution.promptKey(),
                promptResolution.version(),
                modelId,
                "BRIDGE_CONCEPTS",
                requestId,
                messages,
                metadata,
                () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
            );
        } catch (IllegalStateException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("ChatClient.Builder bean is not configured")) {
                throw new ConnectionProviderUnavailableException("AI provider is unavailable for bridge concepts.");
            }
            throw exception;
        } catch (RuntimeException exception) {
            throw new ConnectionProviderUnavailableException("AI provider is unavailable for bridge concepts.");
        }
    }

    private List<BridgeConceptRecommendation> bridgeRecommendations(
        String userId,
        List<String> noteIds,
        List<String> bridgeLinkTitles,
        String content,
        int maxRecommendations
    ) {
        if (!StringUtils.hasText(content)) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (!root.isArray()) {
                return List.of();
            }
            List<BridgeConceptRecommendation> recommendations = new ArrayList<>();
            for (JsonNode node : root) {
                if (recommendations.size() >= maxRecommendations) {
                    break;
                }
                String title = text(node, "title");
                String bridgeReason = text(node, "bridgeReason");
                if (!StringUtils.hasText(title) || !StringUtils.hasText(bridgeReason)) {
                    continue;
                }
                int ordinal = recommendations.size() + 1;
                recommendations.add(new BridgeConceptRecommendation(
                    proposalId(userId, noteIds, title, ordinal),
                    title,
                    normalizeBridgeReason(bridgeReason, bridgeLinkTitles)
                ));
            }
            return recommendations;
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    private void recordBridgeUsage(
        String userId,
        String modelId,
        String requestId,
        AiTokenUsage tokenUsage
    ) {
        aiUsageRecorder.recordChatUsage(userId, BRIDGE_CONCEPTS_FEATURE_ID, modelId, requestId, tokenUsage);
    }

    private String bridgeUserPrompt(
        List<ConnectionBridgeSourceNote> notes,
        List<String> bridgeLinkTitles,
        int maxRecommendations
    ) {
        List<Map<String, Object>> noteSummaries = notes.stream()
            .map(note -> {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("noteId", note.noteId());
                values.put("title", note.title());
                values.put("tags", note.tags());
                return values;
            })
            .toList();
        List<String> requiredWikiLinks = bridgeLinkTitles.stream()
            .map(ConnectionService::wikiLink)
            .toList();
        return """
            Source notes. Only these title/tag fields are available; do not invent note body details:
            %s

            The bridge document links exactly two source concepts: %s.
            In bridgeReason, mention both of those exact wiki links once: %s.
            If more source notes are provided, use them only as background and do not add them as required wiki links.

            Generate at most %d bridge document or topic candidates that would connect these notes.
            Each candidate should be a new document/topic the user could create later, not an existing note lookup.
            """.formatted(toJson(noteSummaries), toJson(bridgeLinkTitles), String.join(", ", requiredWikiLinks), maxRecommendations);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            return String.valueOf(value);
        }
    }

    private static String bridgeSystemPrompt() {
        return """
            You are BrainX bridge concept generator.
            Return only a strict JSON array of bridge concept objects.
            Each object must contain:
            - title: concise Korean bridge document/topic title
            - bridgeReason: one Korean sentence explaining how it connects the two bridge source concepts, including both required wiki links exactly as [[title]]
            Do not return markdown fences, comments, prose, IDs, note bodies, or additional fields.
            """;
    }

    private static String bridgeRuntimeInstructions(int maxRecommendations) {
        return "Return at most %d objects.".formatted(maxRecommendations);
    }

    private static List<String> bridgeLinkTitles(List<ConnectionBridgeSourceNote> sourceNotes) {
        return sourceNotes.stream()
            .map(ConnectionBridgeSourceNote::title)
            .filter(StringUtils::hasText)
            .map(ConnectionService::wikiTitle)
            .limit(MIN_BRIDGE_NOTE_COUNT)
            .toList();
    }

    private static String normalizeBridgeReason(String bridgeReason, List<String> bridgeLinkTitles) {
        String normalized = bridgeReason.trim();
        List<String> missingLinks = bridgeLinkTitles.stream()
            .map(ConnectionService::wikiLink)
            .filter(link -> !normalized.contains(link))
            .toList();
        if (missingLinks.isEmpty()) {
            return normalized;
        }
        return normalized + " 연결 원본: " + String.join(", ", missingLinks) + ".";
    }

    private static String wikiLink(String title) {
        return "[[" + wikiTitle(title) + "]]";
    }

    private static String wikiTitle(String title) {
        return title == null ? "" : title.replaceAll("\\s+", " ").trim();
    }

    private static List<String> normalizeBridgeNoteIds(List<String> noteIds) {
        if (noteIds == null) {
            throw new IllegalArgumentException("noteIds must not be empty.");
        }
        Map<String, Boolean> normalized = new LinkedHashMap<>();
        for (String noteId : noteIds) {
            normalized.put(requireText(noteId, "noteIds[]"), Boolean.TRUE);
        }
        List<String> values = List.copyOf(normalized.keySet());
        if (values.size() < MIN_BRIDGE_NOTE_COUNT) {
            throw new IllegalArgumentException("noteIds must contain at least 2 unique notes.");
        }
        if (values.size() > MAX_BRIDGE_NOTE_COUNT) {
            throw new IllegalArgumentException("noteIds must contain at most 10 notes.");
        }
        return values;
    }

    private static String proposalId(String userId, List<String> noteIds, String title, int ordinal) {
        String seed = userId + "\n" + String.join("\n", noteIds) + "\n" + title + "\n" + ordinal;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(seed.getBytes(StandardCharsets.UTF_8));
            return "bridge-" + HexFormat.of().formatHex(digest).substring(0, 24);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private static AutoLinkStrategyResult linkSuggestionStrategy(AutoLinkResult result) {
        if (result == null || result.strategies() == null) {
            return null;
        }
        return result.strategies().stream()
            .filter(strategy -> strategy.strategy() == NoteAutoLinkStrategy.LLM_ONLY)
            .findFirst()
            .orElse(null);
    }

    private static String jsonPayload(String content) {
        String trimmed = content.trim();
        int arrayStart = trimmed.indexOf('[');
        int arrayEnd = trimmed.lastIndexOf(']');
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
            return trimmed.substring(arrayStart, arrayEnd + 1);
        }
        return trimmed;
    }

    private static String text(JsonNode node, String fieldName) {
        JsonNode value = node == null ? null : node.get(fieldName);
        if (value == null || value.isNull()) {
            return "";
        }
        String text = value.asText("");
        return text == null ? "" : text.trim();
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (int) Math.ceil(safeText.length() / 4.0d));
    }
}
