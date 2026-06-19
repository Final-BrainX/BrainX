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
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingRequest;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingRequest;

class SpringAiAdapterTest {

    @Test
    void generateDelegatesToConfiguredChatClient() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        FakeChatModel chatModel = new FakeChatModel();
        beanFactory.registerSingleton("chatClientBuilder", ChatClient.builder(chatModel));
        var adapter = new SpringAiAdapter(
            beanFactory.getBeanProvider(ChatClient.Builder.class),
            beanFactory.getBeanProvider(EmbeddingModel.class)
        );

        var response = adapter.generate(new AiChatRequest(
            "gpt-5.4-mini",
            List.of(
                new AiChatMessage(AiRole.SYSTEM, "answer from context"),
                new AiChatMessage(AiRole.USER, "question")
            )
        ));

        assertThat(response.content()).isEqualTo("generated answer");
        assertThat(response.tokenUsage().totalTokens()).isEqualTo(9);
        assertThat(chatModel.lastPrompt.getOptions().getModel()).isEqualTo("gpt-5.4-mini");
        assertThat(chatModel.lastPrompt.getInstructions()).hasSize(2);
    }

    @Test
    void generateFailsWhenChatClientIsNotConfigured() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        var adapter = new SpringAiAdapter(
            beanFactory.getBeanProvider(ChatClient.Builder.class),
            beanFactory.getBeanProvider(EmbeddingModel.class)
        );

        assertThatThrownBy(() -> adapter.generate(new AiChatRequest(
            "gpt-5.4-mini",
            List.of(new AiChatMessage(AiRole.USER, "question"))
        )))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ChatClient.Builder bean is not configured");
    }

    @Test
    void embedDelegatesToConfiguredEmbeddingModel() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        beanFactory.registerSingleton("embeddingModel", new FakeEmbeddingModel());
        var adapter = new SpringAiAdapter(
            beanFactory.getBeanProvider(ChatClient.Builder.class),
            beanFactory.getBeanProvider(EmbeddingModel.class)
        );

        var response = adapter.embed(new AiEmbeddingRequest("voyage-4-lite", List.of("first", "second")));

        assertThat(response.vectors()).hasSize(2);
        assertThat(response.vectors().getFirst().text()).isEqualTo("first");
        assertThat(response.vectors().getFirst().values()).containsExactly(1.0d, 2.0d);
        assertThat(response.vectors().get(1).text()).isEqualTo("second");
        assertThat(response.vectors().get(1).values()).containsExactly(3.0d, 4.0d);
    }

    @Test
    void embedFailsWhenEmbeddingModelIsNotConfigured() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        var adapter = new SpringAiAdapter(
            beanFactory.getBeanProvider(ChatClient.Builder.class),
            beanFactory.getBeanProvider(EmbeddingModel.class)
        );

        assertThatThrownBy(() -> adapter.embed(new AiEmbeddingRequest(null, List.of("text"))))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("EmbeddingModel bean is not configured");
    }

    private static final class FakeEmbeddingModel implements EmbeddingModel {

        @Override
        public EmbeddingResponse call(EmbeddingRequest request) {
            return new EmbeddingResponse(List.of(
                new Embedding(new float[] {1.0f, 2.0f}, 0),
                new Embedding(new float[] {3.0f, 4.0f}, 1)
            ));
        }

        @Override
        public float[] embed(Document document) {
            return new float[] {1.0f, 2.0f};
        }
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
                            return null;
                        }
                    })
                    .build()
            );
        }
    }
}
