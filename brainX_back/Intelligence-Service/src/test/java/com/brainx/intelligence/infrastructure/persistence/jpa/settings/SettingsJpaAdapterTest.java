package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;

@DataJpaTest
@ActiveProfiles("test")
@Import(SettingsJpaAdapter.class)
class SettingsJpaAdapterTest {

    @Autowired
    private SettingsJpaAdapter settingsJpaAdapter;

    @Autowired
    private AiModelJpaRepository aiModelJpaRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void findAllReturnsCatalogModelsFromDatabase() {
        aiModelJpaRepository.save(new AiModelJpaEntity(
            "gpt-4o-mini",
            "GPT-4o mini",
            "openai",
            new BigDecimal("0.150000"),
            new BigDecimal("0.075000"),
            new BigDecimal("0.600000"),
            "usd"
        ));
        entityManager.flush();
        entityManager.clear();

        // ai_models는 runtime별 seed가 기본 카탈로그를 채울 수 있으므로,
        // 전체 개수가 아니라 방금 저장한 모델이 포함되어 있는지로 검증한다.
        var models = settingsJpaAdapter.findAll();

        AiModel saved = models.stream()
            .filter(model -> model.modelId().equals("gpt-4o-mini"))
            .findFirst()
            .orElseThrow();
        assertThat(saved.vendorTokenCost().inputCostPer1kTokens()).isEqualByComparingTo("0.150000");
        assertThat(saved.vendorTokenCost().cachedInputCostPer1kTokens()).isEqualByComparingTo("0.075000");
        assertThat(saved.vendorTokenCost().outputCostPer1kTokens()).isEqualByComparingTo("0.600000");
        assertThat(saved.vendorTokenCost().currencyCode()).isEqualTo("USD");
        assertThat(settingsJpaAdapter.existsByModelId("gpt-4o-mini")).isTrue();
        assertThat(settingsJpaAdapter.findByModelId("gpt-4o-mini")).isPresent();
    }

    @Test
    void saveAndFindAiModelSettingsPreservesJsonMap() {
        settingsJpaAdapter.save(new AiModelSettings(
            "user-1",
            "gpt-4o-mini",
            Map.of(
                "openai", Map.of("masked", true),
                "priority", List.of("chat", "assist")
            )
        ));
        entityManager.flush();
        entityManager.clear();

        var found = settingsJpaAdapter.findSettingsByUserId("user-1").orElseThrow();

        assertThat(found.defaultModelId()).isEqualTo("gpt-4o-mini");
        assertThat(found.userApiKeys()).containsEntry("priority", List.of("chat", "assist"));
        assertThat(found.userApiKeys().get("openai")).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> openAiApiKeyInfo = (Map<String, Object>) found.userApiKeys().get("openai");
        assertThat(openAiApiKeyInfo).containsEntry("masked", true);
    }

    @Test
    void saveAndFindStyleProfilePreservesSeparatedStyleMaps() {
        Instant detectedAt = Instant.parse("2026-06-18T03:00:00Z");
        settingsJpaAdapter.save(new StyleProfile(
            "user-1",
            new ConversationTone(Map.of("speechLevel", "haeyo", "directness", "high")),
            new WritingStyle(Map.of("formality", "business", "rules", List.of("ko", "technical"))),
            detectedAt
        ));
        entityManager.flush();
        entityManager.clear();

        var found = settingsJpaAdapter.findStyleProfileByUserId("user-1").orElseThrow();

        assertThat(found.conversationToneValues()).containsEntry("directness", "high");
        assertThat(found.writingStyleValues()).containsEntry("formality", "business");
        assertThat(found.writingStyleValues()).containsEntry("rules", List.of("ko", "technical"));
        assertThat(found.detectedFromNotesAt()).isEqualTo(detectedAt);
    }

    @Test
    void findStyleProfileIgnoresLegacyAssistanceStyleKey() {
        entityManager.persist(new StyleProfileJpaEntity(
            "user-legacy",
            Map.of(
                "conversationTone", Map.of("directness", "high"),
                "writingStyle", Map.of("formality", "business"),
                "assistanceStyle", Map.of("clarificationPolicy", "only_when_blocking")
            ),
            null
        ));
        entityManager.flush();
        entityManager.clear();

        var found = settingsJpaAdapter.findStyleProfileByUserId("user-legacy").orElseThrow();

        assertThat(found.conversationToneValues()).containsEntry("directness", "high");
        assertThat(found.writingStyleValues()).containsEntry("formality", "business");
    }
}
