package com.brainx.intelligence.chat.application.port.inbound;

import java.util.Map;

import reactor.core.publisher.Flux;

public interface SendChatMessageUseCase {

    Flux<ChatStreamEvent> sendChatMessage(SendChatMessageCommand command);

    record SendChatMessageCommand(
        String userId,
        String threadId,
        String message,
        Map<String, Object> noteScope,
        Map<String, Object> clientContext,
        String modelId
    ) {
    }

    record ChatStreamEvent(
        String eventName,
        Map<String, Object> data
    ) {

        public static ChatStreamEvent delta(String text) {
            return new ChatStreamEvent("delta", Map.of("text", text == null ? "" : text));
        }

        public static ChatStreamEvent done(String messageId) {
            return new ChatStreamEvent("done", Map.of("messageId", messageId));
        }

        public static ChatStreamEvent done(String messageId, String llmRunId) {
            if (llmRunId == null || llmRunId.isBlank()) {
                return done(messageId);
            }
            return new ChatStreamEvent("done", Map.of(
                "messageId", messageId,
                "llmRunId", llmRunId
            ));
        }

        public static ChatStreamEvent route(String route, String reason, String routerModel) {
            return new ChatStreamEvent("route", Map.of(
                "route", route == null || route.isBlank() ? "OUT_OF_SCOPE" : route,
                "reason", reason == null ? "" : reason,
                "routerModel", routerModel == null ? "" : routerModel
            ));
        }

        public static ChatStreamEvent error(String code, String message) {
            return new ChatStreamEvent("error", Map.of(
                "code", code == null || code.isBlank() ? "STREAM_ERROR" : code,
                "message", message == null || message.isBlank() ? "RAG chat stream failed." : message
            ));
        }
    }
}
