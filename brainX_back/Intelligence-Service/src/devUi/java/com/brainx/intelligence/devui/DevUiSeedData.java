package com.brainx.intelligence.devui;

import java.math.BigDecimal;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.infrastructure.persistence.jpa.settings.AiModelJpaEntity;
import com.brainx.intelligence.infrastructure.persistence.jpa.settings.AiModelJpaRepository;

@Component
@Profile("dev-ui")
class DevUiSeedData implements ApplicationRunner {

    private final AiModelJpaRepository aiModelJpaRepository;

    DevUiSeedData(AiModelJpaRepository aiModelJpaRepository) {
        this.aiModelJpaRepository = aiModelJpaRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (aiModelJpaRepository.count() > 0) {
            return;
        }

        aiModelJpaRepository.save(new AiModelJpaEntity(
            "gpt-4o-mini",
            "GPT-4o mini",
            "openai",
            new BigDecimal("0.150000"),
            new BigDecimal("0.600000")
        ));
        aiModelJpaRepository.save(new AiModelJpaEntity(
            "gpt-4o",
            "GPT-4o",
            "openai",
            new BigDecimal("2.500000"),
            new BigDecimal("10.000000")
        ));
    }
}
