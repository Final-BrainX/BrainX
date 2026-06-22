package com.brainx.intelligence.infrastructure.ai;

import java.util.List;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;

import reactor.core.publisher.Flux;

/**
 * Spring AI chat model을 shared outbound port로 연결합니다.
 */
@Component
public class SpringAiAdapter implements AiChatPort {

    private final ObjectProvider<ChatClient.Builder> chatClientBuilderProvider;

    public SpringAiAdapter(ObjectProvider<ChatClient.Builder> chatClientBuilderProvider) {
        this.chatClientBuilderProvider = chatClientBuilderProvider;
    }

    @Override
    public AiChatResponse generate(AiChatRequest request) {
        ChatResponse chatResponse = chatClient()
            .prompt(toPrompt(request))
            .call()
            .chatResponse();
        if (chatResponse == null || chatResponse.getResult() == null) {
            return new AiChatResponse("", new AiTokenUsage(null, null, null));
        }
        String content = chatResponse.getResult().getOutput().getText();
        return new AiChatResponse(content == null ? "" : content, tokenUsage(chatResponse));
    }

    @Override
    public Flux<AiChatChunk> stream(AiChatRequest request) {
        return chatClient()
            .prompt(toPrompt(request))
            .stream()
            .content()
            .map(delta -> new AiChatChunk(delta, false))
            .concatWithValues(new AiChatChunk("", true));
    }

    private ChatClient chatClient() {
        ChatClient.Builder builder = chatClientBuilderProvider.getIfAvailable();
        if (builder == null) {
            throw new IllegalStateException("ChatClient.Builder bean is not configured.");
        }
        return builder.build();
    }

    private static Prompt toPrompt(AiChatRequest request) {
        List<AiChatMessage> aiMessages = request == null || request.messages() == null ? List.of() : request.messages();
        if (aiMessages.isEmpty()) {
            throw new IllegalArgumentException("Chat messages must not be empty.");
        }

        List<Message> messages = aiMessages.stream()
            .map(SpringAiAdapter::toMessage)
            .toList();

        if (request != null && StringUtils.hasText(request.modelId())) {
            return new Prompt(messages, ChatOptions.builder()
                .model(request.modelId())
                .build());
        }
        return new Prompt(messages);
    }

    private static Message toMessage(AiChatMessage message) {
        String content = message.content() == null ? "" : message.content();
        return switch (message.role()) {
            case SYSTEM -> new SystemMessage(content);
            case USER -> new UserMessage(content);
            case ASSISTANT -> new AssistantMessage(content);
        };
    }

    private static AiTokenUsage tokenUsage(ChatResponse chatResponse) {
        Usage usage = chatResponse.getMetadata() == null ? null : chatResponse.getMetadata().getUsage();
        if (usage == null) {
            return new AiTokenUsage(null, null, null);
        }
        return new AiTokenUsage(
            usage.getPromptTokens(),
            usage.getCompletionTokens(),
            usage.getTotalTokens(),
            cachedPromptTokens(usage.getNativeUsage()),
            reasoningTokens(usage.getNativeUsage())
        );
    }

    private static Integer cachedPromptTokens(Object nativeUsage) {
        if (nativeUsage instanceof OpenAiApi.Usage openAiUsage
            && openAiUsage.promptTokensDetails() != null) {
            return openAiUsage.promptTokensDetails().cachedTokens();
        }
        return null;
    }

    private static Integer reasoningTokens(Object nativeUsage) {
        if (nativeUsage instanceof OpenAiApi.Usage openAiUsage
            && openAiUsage.completionTokenDetails() != null) {
            return openAiUsage.completionTokenDetails().reasoningTokens();
        }
        return null;
    }

    ObjectProvider<ChatClient.Builder> chatClientBuilderProvider() {
        return chatClientBuilderProvider;
    }
}
