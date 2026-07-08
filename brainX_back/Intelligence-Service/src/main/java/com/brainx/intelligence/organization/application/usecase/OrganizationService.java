package com.brainx.intelligence.organization.application.usecase;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalCommand;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalResult;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationEventPort.FolderOrganizationProposalCreatedEvent;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort.OrganizationNoteSource;
import com.brainx.intelligence.organization.domain.OrganizationConflictException;
import com.brainx.intelligence.organization.domain.OrganizationForbiddenException;
import com.brainx.intelligence.organization.domain.OrganizationNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationProviderUnavailableException;
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
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class OrganizationService implements CreateFolderOrganizationProposalUseCase {

    static final String FOLDER_ORGANIZATION_CAPABILITY = "FOLDER_ORGANIZATION";
    static final String FOLDER_ORGANIZATION_FEATURE_ID = "folder-organization";
    private static final String SCOPE_ALL = "all";
    private static final String SCOPE_FOLDER = "folder";
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final OrganizationNoteSourcePort noteSourcePort;
    private final EntitlementPort entitlementPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final OrganizationEventPort organizationEventPort;
    private final OrganizationProperties properties;
    private final StylePromptCompiler stylePromptCompiler;
    private final ObjectMapper objectMapper;

    public OrganizationService(
        OrganizationNoteSourcePort noteSourcePort,
        EntitlementPort entitlementPort,
        AiModelSettingsPort aiModelSettingsPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        OrganizationEventPort organizationEventPort,
        OrganizationProperties properties,
        StylePromptCompiler stylePromptCompiler,
        ObjectMapper objectMapper
    ) {
        this.noteSourcePort = noteSourcePort;
        this.entitlementPort = entitlementPort;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.organizationEventPort = organizationEventPort;
        this.properties = properties;
        this.stylePromptCompiler = stylePromptCompiler;
        this.objectMapper = objectMapper;
    }

    @Override
    public FolderOrganizationProposalResult createFolderOrganizationProposal(FolderOrganizationProposalCommand command) {
        String userId = requireText(command.userId(), "userId");
        String documentGroupId = requireText(command.documentGroupId(), "documentGroupId");
        ScopeSpec scope = ScopeSpec.from(command.scope(), command.folderId());
        List<OrganizationNoteSource> notes = loadNotes(userId, documentGroupId, scope);
        if (notes.isEmpty() && scope.all()) {
            throw new OrganizationConflictException("No searchable notes are available for folder organization.");
        }
        if (notes.isEmpty()) {
            throw new OrganizationNotFoundException("Folder has no searchable notes for organization: " + scope.folderId());
        }

        String proposalId = UUID.randomUUID().toString();
        String modelId = resolveModelId(userId);
        int maxProposedFolders = properties.getMaxProposedFolders();
        int maxProposedMoves = properties.getMaxProposedMoves();
        PromptResolution promptResolution = promptRegistryService.resolve("organization.folder", systemPrompt());
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt(
            StylePromptCompiler.appendToSystemPrompt(
                promptResolution.content(),
                runtimeInstructions(maxProposedFolders, maxProposedMoves)
            ),
            stylePromptCompiler.conversationToneInstructions(userId)
        );
        String userPrompt = userPrompt(notes, scope, maxProposedFolders, maxProposedMoves);
        int tokenEstimate = estimateTokens(systemPrompt + "\n" + userPrompt);
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            FOLDER_ORGANIZATION_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new OrganizationForbiddenException("AI capability is not available: " + entitlement.reasonCode());
        }

        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, systemPrompt),
            new AiChatMessage(AiRole.USER, userPrompt)
        );
        var recorded = generate(userId, modelId, proposalId, promptResolution, messages);
        AiChatResponse response = recorded.response();
        String content = response == null || response.content() == null ? "" : response.content();
        recordUsage(userId, modelId, proposalId, response == null ? null : response.tokenUsage());
        ParsedProposal parsed = parseProposal(content, noteIds(notes), maxProposedFolders, maxProposedMoves);
        organizationEventPort.folderOrganizationProposalCreated(new FolderOrganizationProposalCreatedEvent(
            userId,
            proposalId,
            FOLDER_ORGANIZATION_FEATURE_ID,
            null,
            modelId
        ));
        return new FolderOrganizationProposalResult(
            proposalId,
            recorded.llmRunId(),
            parsed.proposedFolders(),
            parsed.proposedMoves()
        );
    }

    private List<OrganizationNoteSource> loadNotes(String userId, String documentGroupId, ScopeSpec scope) {
        if (scope.all()) {
            return noteSourcePort.findOrganizationSourceNotes(userId, documentGroupId, properties.getMaxNotes());
        }
        return noteSourcePort.findOrganizationSourceNotesByFolder(
            userId,
            documentGroupId,
            scope.folderId(),
            properties.getMaxNotes()
        );
    }

    private String resolveModelId(String userId) {
        return aiModelSettingsPort.findSettingsByUserId(userId)
            .map(settings -> settings.defaultModelId())
            .filter(StringUtils::hasText)
            .orElseGet(() -> requireText(properties.getDefaultModel(), "brainx.organization.default-model"));
    }

    private AiRunRecorder.RecordedChatResponse generate(
        String userId,
        String modelId,
        String proposalId,
        PromptResolution promptResolution,
        List<AiChatMessage> messages
    ) {
        try {
            return aiRunRecorder.recordChatGenerateWithRun(
                userId,
                FOLDER_ORGANIZATION_FEATURE_ID,
                promptResolution.promptKey(),
                promptResolution.version(),
                modelId,
                "FOLDER_ORGANIZATION_PROPOSAL",
                proposalId,
                messages,
                Map.of(),
                () -> aiChatPort.generate(new AiChatRequest(modelId, messages))
            );
        } catch (IllegalStateException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("ChatClient.Builder bean is not configured")) {
                throw new OrganizationProviderUnavailableException("AI provider is unavailable for folder organization.");
            }
            throw exception;
        } catch (RuntimeException exception) {
            throw new OrganizationProviderUnavailableException("AI provider is unavailable for folder organization.");
        }
    }

    private ParsedProposal parseProposal(
        String content,
        Set<String> sourceNoteIds,
        int maxProposedFolders,
        int maxProposedMoves
    ) {
        if (!StringUtils.hasText(content)) {
            return ParsedProposal.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(jsonPayload(content));
            if (!root.isObject()) {
                return ParsedProposal.empty();
            }
            return new ParsedProposal(
                objectArray(root.get("proposedFolders"), maxProposedFolders).stream()
                    .filter(item -> StringUtils.hasText(stringValue(item.get("name"))))
                    .map(item -> normalizedFolder(item, sourceNoteIds))
                    .toList(),
                objectArray(root.get("proposedMoves"), maxProposedMoves).stream()
                    .filter(item -> sourceNoteIds.contains(stringValue(item.get("noteId"))))
                    .filter(OrganizationService::hasMoveTarget)
                    .toList()
            );
        } catch (JsonProcessingException exception) {
            return ParsedProposal.empty();
        }
    }

    private List<Map<String, Object>> objectArray(JsonNode arrayNode, int limit) {
        if (arrayNode == null || !arrayNode.isArray()) {
            return List.of();
        }
        List<Map<String, Object>> values = new ArrayList<>();
        for (JsonNode item : arrayNode) {
            if (values.size() >= limit) {
                break;
            }
            if (item != null && item.isObject()) {
                Map<String, Object> value = objectMapper.convertValue(item, MAP_TYPE);
                if (!value.isEmpty()) {
                    values.add(new LinkedHashMap<>(value));
                }
            }
        }
        return values;
    }

    private static Map<String, Object> normalizedFolder(Map<String, Object> item, Set<String> sourceNoteIds) {
        Object noteIds = item.get("noteIds");
        if (!(noteIds instanceof List<?> values)) {
            return item;
        }
        List<String> filteredNoteIds = values.stream()
            .filter(String.class::isInstance)
            .map(String.class::cast)
            .filter(sourceNoteIds::contains)
            .toList();
        Map<String, Object> normalized = new LinkedHashMap<>(item);
        normalized.put("noteIds", filteredNoteIds);
        return normalized;
    }

    private static boolean hasMoveTarget(Map<String, Object> item) {
        return StringUtils.hasText(stringValue(item.get("targetFolderName")))
            || StringUtils.hasText(stringValue(item.get("targetFolderId")));
    }

    private void recordUsage(
        String userId,
        String modelId,
        String proposalId,
        AiTokenUsage tokenUsage
    ) {
        aiUsageRecorder.recordChatUsage(userId, FOLDER_ORGANIZATION_FEATURE_ID, modelId, proposalId, tokenUsage);
    }

    private String userPrompt(
        List<OrganizationNoteSource> notes,
        ScopeSpec scope,
        int maxProposedFolders,
        int maxProposedMoves
    ) {
        List<Map<String, Object>> noteCards = notes.stream()
            .map(note -> {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("noteId", note.noteId());
                values.put("folderId", note.folderId());
                values.put("title", note.title());
                values.put("tags", note.tags());
                values.put("headings", note.headings());
                values.put("excerpt", note.excerpt());
                return values;
            })
            .toList();
        return """
            Scope: %s
            FolderId: %s
            Maximum proposedFolders: %d
            Maximum proposedMoves: %d

            Note cards:
            %s

            Suggest a better folder organization. Prefer useful folder names and moves that reduce scattered notes.
            Only use noteIds from the provided note cards.
            """.formatted(
            scope.scope(),
            scope.folderId() == null ? "" : scope.folderId(),
            maxProposedFolders,
            maxProposedMoves,
            toJson(noteCards)
        );
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            return String.valueOf(value);
        }
    }

    private static String systemPrompt() {
        return """
            You are BrainX folder organization assistant.
            Return only a strict JSON object with exactly these top-level arrays:
            - proposedFolders: each object must include name and may include noteIds and reason.
            - proposedMoves: each object must include noteId and targetFolderName or targetFolderId.
            Use concise Korean names and reasons. Do not return markdown fences, comments, prose, or note body text.
            """;
    }

    private static String runtimeInstructions(int maxProposedFolders, int maxProposedMoves) {
        return """
            proposedFolders must contain at most %d objects.
            proposedMoves must contain at most %d objects.
            """.formatted(maxProposedFolders, maxProposedMoves);
    }

    private static Set<String> noteIds(List<OrganizationNoteSource> notes) {
        LinkedHashSet<String> noteIds = new LinkedHashSet<>();
        notes.forEach(note -> noteIds.add(note.noteId()));
        return noteIds;
    }

    private static String jsonPayload(String content) {
        String trimmed = content.trim();
        int objectStart = trimmed.indexOf('{');
        int objectEnd = trimmed.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
            return trimmed.substring(objectStart, objectEnd + 1);
        }
        return trimmed;
    }

    private static String requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(name + " must not be blank.");
        }
        return value.trim();
    }

    private static String stringValue(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

    private static int estimateTokens(String text) {
        String safeText = text == null ? "" : text;
        return Math.max(1, (int) Math.ceil(safeText.length() / 4.0d));
    }

    private record ScopeSpec(
        String scope,
        String folderId
    ) {
        static ScopeSpec from(String scope, String folderId) {
            String normalizedScope = requireText(scope, "scope").toLowerCase();
            if (SCOPE_ALL.equals(normalizedScope)) {
                return new ScopeSpec(SCOPE_ALL, null);
            }
            if (SCOPE_FOLDER.equals(normalizedScope)) {
                return new ScopeSpec(SCOPE_FOLDER, requireText(folderId, "folderId"));
            }
            throw new IllegalArgumentException("scope must be all or folder.");
        }

        boolean all() {
            return SCOPE_ALL.equals(scope);
        }
    }

    private record ParsedProposal(
        List<Map<String, Object>> proposedFolders,
        List<Map<String, Object>> proposedMoves
    ) {
        static ParsedProposal empty() {
            return new ParsedProposal(List.of(), List.of());
        }
    }
}
