package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@ActiveProfiles("test")
class LocalAiModelSeedDataTest {

    @Autowired
    private AiModelJpaRepository aiModelJpaRepository;

    @Test
    void seedsLocalAiModelsWithPer1kTokenCost() throws Exception {
        new LocalAiModelSeedData(aiModelJpaRepository).run(null);

        assertThat(aiModelJpaRepository.findAll())
            .extracting(AiModelJpaEntity::getModelId)
            .containsExactlyInAnyOrder(
                "gpt-5.4-mini",
                "voyage-4-large",
                "voyage-4",
                "voyage-4-lite",
                "voyage-context-3"
            );

        var gptMini = aiModelJpaRepository.findById("gpt-5.4-mini").orElseThrow().toDomain();
        assertThat(gptMini.name()).isEqualTo("GPT-5.4 mini");
        assertThat(gptMini.provider()).isEqualTo("openai");
        assertThat(gptMini.vendorTokenCost().inputCostPer1kTokens()).isEqualByComparingTo("0.000750");
        assertThat(gptMini.vendorTokenCost().cachedInputCostPer1kTokens()).isEqualByComparingTo("0.000075");
        assertThat(gptMini.vendorTokenCost().outputCostPer1kTokens()).isEqualByComparingTo("0.004500");
        assertThat(gptMini.vendorTokenCost().currencyCode()).isEqualTo("USD");

        var lite = aiModelJpaRepository.findById("voyage-4-lite").orElseThrow().toDomain();
        assertThat(lite.name()).isEqualTo("Voyage 4 Lite");
        assertThat(lite.provider()).isEqualTo("voyage");
        assertThat(lite.vendorTokenCost().inputCostPer1kTokens()).isEqualByComparingTo("0.000020");
        assertThat(lite.vendorTokenCost().cachedInputCostPer1kTokens()).isNull();
        assertThat(lite.vendorTokenCost().outputCostPer1kTokens()).isNull();
        assertThat(lite.vendorTokenCost().currencyCode()).isEqualTo("USD");

        var context = aiModelJpaRepository.findById("voyage-context-3").orElseThrow().toDomain();
        assertThat(context.vendorTokenCost().inputCostPer1kTokens()).isEqualByComparingTo("0.000180");
    }
}
