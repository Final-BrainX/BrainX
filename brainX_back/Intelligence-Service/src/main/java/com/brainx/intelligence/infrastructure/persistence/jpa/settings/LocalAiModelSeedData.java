package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Profile({"local", "dev-ui"})
@Order(Ordered.HIGHEST_PRECEDENCE)
class LocalAiModelSeedData implements ApplicationRunner {

    private static final String VOYAGE_PROVIDER = "voyage";
    private static final String OPENAI_PROVIDER = "openai";
    private static final String USD = "USD";

    private final AiModelJpaRepository aiModelJpaRepository;

    LocalAiModelSeedData(AiModelJpaRepository aiModelJpaRepository) {
        this.aiModelJpaRepository = aiModelJpaRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedModels().forEach(aiModelJpaRepository::save);
    }

    private static List<AiModelJpaEntity> seedModels() {
        return List.of(
            openAi("gpt-5.4-mini", "GPT-5.4 mini", "0.000750", "0.000075", "0.004500"),
            voyage("voyage-4-large", "Voyage 4 Large", "0.000120"),
            voyage("voyage-4", "Voyage 4", "0.000060"),
            voyage("voyage-4-lite", "Voyage 4 Lite", "0.000020"),
            voyage("voyage-context-3", "Voyage Context 3", "0.000180")
        );
    }

    private static AiModelJpaEntity openAi(
        String modelId,
        String name,
        String inputCostPer1kTokens,
        String cachedInputCostPer1kTokens,
        String outputCostPer1kTokens
    ) {
        return new AiModelJpaEntity(
            modelId,
            name,
            OPENAI_PROVIDER,
            new BigDecimal(inputCostPer1kTokens),
            new BigDecimal(cachedInputCostPer1kTokens),
            new BigDecimal(outputCostPer1kTokens),
            USD
        );
    }

    private static AiModelJpaEntity voyage(String modelId, String name, String inputCostPer1kTokens) {
        return new AiModelJpaEntity(
            modelId,
            name,
            VOYAGE_PROVIDER,
            new BigDecimal(inputCostPer1kTokens),
            null,
            null,
            USD
        );
    }
}
