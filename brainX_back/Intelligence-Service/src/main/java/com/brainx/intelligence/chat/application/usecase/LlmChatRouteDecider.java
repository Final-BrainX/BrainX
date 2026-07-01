package com.brainx.intelligence.chat.application.usecase;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.usecase.ChatRouteDecider.ChatRouteRequest;
import com.brainx.intelligence.chat.domain.ChatRoute;
import com.brainx.intelligence.chat.domain.ChatRouteDecision;
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
    private final ObjectMapper objectMapper;

    public LlmChatRouteDecider(
        ChatRouterProperties properties,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder,
        ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
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
        var response = aiChatPort.generate(new AiChatRequest(
            routerModel,
            List.of(
                new AiChatMessage(AiRole.SYSTEM, systemPrompt()),
                new AiChatMessage(AiRole.USER, userPrompt(request))
            )
        ));
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
            - COMPOSE: asks to write, draft, rewrite, outline, or create content.
            - NOTE_ACTION: asks to save, insert, append, apply, or add generated content to a note. This only produces a draft; no mutation is performed.
            - OUT_OF_SCOPE: weather, news, general web knowledge, coding help, app navigation, account, billing, settings, or anything unrelated to notes/search/writing/note draft application.
            Routing priority:
            - If the message refers to the current note, this note, selected note/text, current document group, current thread, or current document-group notes, choose NOTE_QA unless it asks to save/insert/apply content.
            - Choose WORKSPACE_SEARCH only when the user explicitly asks across all notes, the whole workspace, every note, my entire notes, or user-wide/global note search.
            Examples:
            - "현재 문서 그룹 노트 기준으로 RAG 흐름을 설명해줘" -> NOTE_QA
            - "이 노트에서 토큰 사용량 기록 과정을 설명해줘" -> NOTE_QA
            - "내 전체 노트에서 인증과 토큰 사용량 관련 내용을 찾아 비교해줘" -> WORKSPACE_SEARCH
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
