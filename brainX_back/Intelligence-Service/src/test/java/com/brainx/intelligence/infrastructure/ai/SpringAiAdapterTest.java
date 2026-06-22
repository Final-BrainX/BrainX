package com.brainx.intelligence.infrastructure.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;

class SpringAiAdapterTest {

    @Test
    void generateDelegatesToConfiguredChatClient() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        FakeChatModel chatModel = new FakeChatModel();
        beanFactory.registerSingleton("chatClientBuilder", ChatClient.builder(chatModel));
        var adapter = new SpringAiAdapter(beanFactory.getBeanProvider(ChatClient.Builder.class));

        var response = adapter.generate(new AiChatRequest(
            "gpt-5.4-mini",
            List.of(
                new AiChatMessage(AiRole.SYSTEM, "answer from context"),
                new AiChatMessage(AiRole.USER, "question")
            )
        ));

        assertThat(response.content()).isEqualTo("generated answer");
        assertThat(response.tokenUsage().totalTokens()).isEqualTo(9);
        assertThat(response.tokenUsage().cachedPromptTokens()).isEqualTo(2);
        assertThat(response.tokenUsage().reasoningTokens()).isEqualTo(1);
        assertThat(chatModel.lastPrompt.getOptions().getModel()).isEqualTo("gpt-5.4-mini");
        assertThat(chatModel.lastPrompt.getInstructions()).hasSize(2);
    }

    @Test
    void generateFailsWhenChatClientIsNotConfigured() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        var adapter = new SpringAiAdapter(beanFactory.getBeanProvider(ChatClient.Builder.class));

        assertThatThrownBy(() -> adapter.generate(new AiChatRequest(
            "gpt-5.4-mini",
            List.of(new AiChatMessage(AiRole.USER, "question"))
        )))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ChatClient.Builder bean is not configured");
    }

    private static final class FakeChatModel implements ChatModel {

        private Prompt lastPrompt;

        @Override
        public ChatResponse call(Prompt prompt) {
            lastPrompt = prompt;
            return new ChatResponse(
                List.of(new Generation(new AssistantMessage("generated answer"))),
                ChatResponseMetadata.builder()
                    .usage(new Usage() {
                        @Override
                        public Integer getPromptTokens() {
                            return 4;
                        }

                        @Override
                        public Integer getCompletionTokens() {
                            return 5;
                        }

                        @Override
                        public Object getNativeUsage() {
                            return new OpenAiApi.Usage(
                                5,
                                4,
                                9,
                                new OpenAiApi.Usage.PromptTokensDetails(0, 2),
                                new OpenAiApi.Usage.CompletionTokenDetails(1, 0, 0, 0)
                            );
                        }
                    })
                    .build()
            );
        }
    }
}
