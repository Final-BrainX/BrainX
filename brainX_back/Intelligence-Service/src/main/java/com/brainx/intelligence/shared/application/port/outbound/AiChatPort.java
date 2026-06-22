package com.brainx.intelligence.shared.application.port.outbound;

import java.util.List;

import reactor.core.publisher.Flux;

/**
 * 생성형 AI 채팅 모델을 application 계층에서 기술 독립적으로 호출하기 위한 출력 포트입니다.
 */
public interface AiChatPort {

    AiChatResponse generate(AiChatRequest request);

    Flux<AiChatChunk> stream(AiChatRequest request);

    record AiChatRequest(
        String modelId,
        List<AiChatMessage> messages
    ) {
    }

    record AiChatMessage(
        AiRole role,
        String content
    ) {
    }

    enum AiRole {
        SYSTEM,
        USER,
        ASSISTANT
    }

    record AiChatResponse(
        String content,
        AiTokenUsage tokenUsage
    ) {
    }

    record AiChatChunk(
        String delta,
        boolean done
    ) {
    }

    record AiTokenUsage(
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens,
        Integer cachedPromptTokens,
        Integer reasoningTokens
    ) {
        public AiTokenUsage(
            Integer promptTokens,
            Integer completionTokens,
            Integer totalTokens
        ) {
            this(promptTokens, completionTokens, totalTokens, null, null);
        }

        public boolean hasKnownTokens() {
            return promptTokens != null
                || completionTokens != null
                || totalTokens != null
                || cachedPromptTokens != null
                || reasoningTokens != null;
        }
    }
}
