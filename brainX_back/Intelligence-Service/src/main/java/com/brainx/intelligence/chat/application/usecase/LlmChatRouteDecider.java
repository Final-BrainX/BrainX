package com.brainx.intelligence.chat.application.usecase;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.usecase.ChatRouteDecider.ChatRouteRequest;
import com.brainx.intelligence.chat.domain.ChatRoute;
import com.brainx.intelligence.chat.domain.ChatRouteDecision;
import com.brainx.intelligence.llmops.application.service.AiRunRecorder;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService;
import com.brainx.intelligence.llmops.application.service.PromptRegistryService.PromptResolution;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class LlmChatRouteDecider implements ChatRouteDecider {

    static final String CHAT_ROUTER_FEATURE_ID = "chat-router-classifier";

    private final ChatRouterProperties properties;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiRunRecorder aiRunRecorder;
    private final PromptRegistryService promptRegistryService;
    private final ObjectMapper objectMapper;

    public LlmChatRouteDecider(
        ChatRouterProperties properties,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        AiRunRecorder aiRunRecorder,
        PromptRegistryService promptRegistryService,
        ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
        this.aiRunRecorder = aiRunRecorder;
        this.promptRegistryService = promptRegistryService;
        this.objectMapper = objectMapper;
    }

    @Override
    public ChatRouteDecision decide(ChatRouteRequest request) {
        String routerModel = properties.getModel();
        if (!properties.isEnabled()) {
            return new ChatRouteDecision(ChatRoute.NOTE_QA, "router disabled", routerModel);
        }
        try {
            AiChatResponseWithPrompt routed = routeWithPrompt(request, routerModel);
            aiUsageRecorder.recordChatUsage(
                request.userId(),
                CHAT_ROUTER_FEATURE_ID,
                routerModel,
                null,
                routed.response().tokenUsage()
            );
            return parseDecision(routed.response().content(), routerModel);
        } catch (RuntimeException exception) {
            return ChatRouteDecision.outOfScope("router failed", routerModel);
        }
    }

    private AiChatResponseWithPrompt routeWithPrompt(ChatRouteRequest request, String routerModel) {
        PromptResolution resolution = promptRegistryService.resolve("chat.route", systemPrompt());
        List<AiChatMessage> messages = List.of(
            new AiChatMessage(AiRole.SYSTEM, resolution.content()),
            new AiChatMessage(AiRole.USER, userPrompt(request))
        );
        var response = aiRunRecorder.recordChatGenerate(
            request.userId(),
            CHAT_ROUTER_FEATURE_ID,
            resolution.promptKey(),
            resolution.version(),
            routerModel,
            "CHAT_ROUTE",
            null,
            messages,
            Map.of("documentGroupId", request.documentGroupId()),
            () -> aiChatPort.generate(new AiChatRequest(routerModel, messages))
        );
        return new AiChatResponseWithPrompt(response);
    }

    private ChatRouteDecision parseDecision(String content, String routerModel) {
        if (!StringUtils.hasText(content)) {
            return ChatRouteDecision.outOfScope("empty router response", routerModel);
        }
        try {
            JsonNode root = objectMapper.readTree(content);
            ChatRoute route = ChatRoute.fromValue(root.path("route").asText());
            String reason = root.path("reason").asText("");
            return new ChatRouteDecision(route, reason, routerModel);
        } catch (Exception exception) {
            return ChatRouteDecision.outOfScope("invalid router response", routerModel);
        }
    }

    private static String systemPrompt() {
        return """
            You are BrainX chat router.
            Return only strict JSON with keys route and reason.
            Allowed routes:
            - NOTE_QA: asks a question that should be answered from the current note/document group context.
            - WORKSPACE_SEARCH: asks to find, search, compare, or summarize information across the user's notes.
            - COMPOSE: asks to write, draft, rewrite, outline, or create content. Choose COMPOSE for writing requests even when the topic mentions external, current, news, sports, political, or general web knowledge.
            - NOTE_ACTION: asks to save, insert, append, apply, or add generated content to a note. This only produces a draft; no mutation is performed.
            - OUT_OF_SCOPE: weather, news, general web knowledge, coding help, app navigation, account, billing, settings, or anything unrelated to notes/search/writing/note draft application. Do not choose OUT_OF_SCOPE solely because a writing request mentions current or external facts.
            Routing priority:
            - If the message refers to the current note, this note, selected note/text, current document group, current thread, or current document-group notes, choose NOTE_QA unless it asks to save/insert/apply content.
            - Choose WORKSPACE_SEARCH only when the user explicitly asks across all notes, the whole workspace, every note, my entire notes, or user-wide/global note search.
            - Choose NOTE_ACTION when the user asks to save, insert, append, apply, or add generated content to a note.
            - Choose COMPOSE when the main intent is to produce a document, report, post, outline, or draft, even if the subject itself is not in the user's notes.
            - Choose OUT_OF_SCOPE for pure current-fact lookup without a writing/drafting deliverable.
            Examples:
            - "현재 문서 그룹 노트 기준으로 RAG 흐름을 설명해줘" -> NOTE_QA
            - "이 노트에서 토큰 사용량 기록 과정을 설명해줘" -> NOTE_QA
            - "내 전체 노트에서 인증과 토큰 사용량 관련 내용을 찾아 비교해줘" -> WORKSPACE_SEARCH
            - "최신 홍명보호 월드컵 성적에 대한 문서 작성해줘" -> COMPOSE
            - "홍명보호 월드컵 성적을 바탕으로 보고서 초안 써줘" -> COMPOSE
            - "오늘 월드컵 예선 결과 알려줘" -> OUT_OF_SCOPE
            Do not answer the user. Classify only.
            """;
    }

    private static String userPrompt(ChatRouteRequest request) {
        Map<String, Object> clientContext = request.clientContext() == null ? Map.of() : request.clientContext();
        Map<String, Object> noteScope = request.noteScope() == null ? Map.of() : request.noteScope();
        return """
            Message:
            %s

            Metadata:
            documentGroupId=%s
            noteScopeKeys=%s
            clientContextSource=%s
            clientContextMode=%s
            clientContextItemCount=%d

            Return JSON only.
            """.formatted(
            request.message(),
            request.documentGroupId(),
            noteScope.keySet(),
            stringValue(clientContext.get("source")),
            stringValue(clientContext.get("mode")),
            itemCount(clientContext.get("items"))
        );
    }

    private static int itemCount(Object items) {
        return items instanceof List<?> list ? list.size() : 0;
    }

    private static String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private record AiChatResponseWithPrompt(AiChatPort.AiChatResponse response) {
    }
}
