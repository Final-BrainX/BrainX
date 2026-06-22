package com.brainx.intelligence.settings.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase.GetStyleProfileQuery;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.ListAiModelsQuery;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase.PutAiModelSettingsCommand;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase.PutStyleProfileCommand;
import com.brainx.intelligence.settings.application.port.outbound.AiModelAvailabilityPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelAvailabilityPolicy;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.UnknownAiModelException;
import com.brainx.intelligence.settings.domain.VendorTokenCost;

class AiSettingsServiceTest {

    private final InMemorySettingsPorts ports = new InMemorySettingsPorts();
    private final AiSettingsService service = new AiSettingsService(ports, ports, ports, ports);

    @Test
    void listAiModelsReturnsEmptyCatalog() {
        var result = service.listAiModels(new ListAiModelsQuery("user-1"));

        assertThat(result.models()).isEmpty();
        assertThat(result.enabledModels()).isEmpty();
        assertThat(result.costInfo().billingUnit()).isEqualTo("TOKEN");
        assertThat(result.costInfo().summary()).isEmpty();
        assertThat(result.costInfo().details()).isEmpty();
    }

    @Test
    void listAiModelsReturnsCatalogModelsAndExternallyEnabledModelIds() {
        ports.addModel(new AiModel(
            "gpt-4o-mini",
            "GPT-4o mini",
            "openai",
            new VendorTokenCost(
                new BigDecimal("0.150000"),
                new BigDecimal("0.075000"),
                new BigDecimal("0.600000"),
                "usd"
            )
        ));
        ports.addModel(new AiModel(
            "gpt-4o",
            "GPT-4o",
            "openai",
            new VendorTokenCost(new BigDecimal("2.500000"), new BigDecimal("10.000000"))
        ));
        ports.enableModels("gpt-4o");

        var result = service.listAiModels(new ListAiModelsQuery("user-1"));

        assertThat(result.models())
            .extracting("modelId")
            .containsExactly("gpt-4o-mini", "gpt-4o");
        assertThat(result.enabledModels()).containsExactly("gpt-4o");
        assertThat(result.models().getFirst().vendorInputCostPer1kTokens()).isEqualByComparingTo("0.150000");
        assertThat(result.models().getFirst().vendorCachedInputCostPer1kTokens()).isEqualByComparingTo("0.075000");
        assertThat(result.models().getFirst().vendorOutputCostPer1kTokens()).isEqualByComparingTo("0.600000");
        assertThat(result.models().getFirst().costCurrency()).isEqualTo("USD");
        assertThat(result.models().getFirst().enabled()).isFalse();
        assertThat(result.models().get(1).enabled()).isTrue();
    }

    @Test
    void listAiModelsIgnoresEnabledModelIdsMissingFromCatalog() {
        ports.addModel(new AiModel("gpt-4o-mini", "GPT-4o mini", "openai", null));
        ports.enableModels("missing-model", "gpt-4o-mini");

        var result = service.listAiModels(new ListAiModelsQuery("user-1"));

        assertThat(result.models())
            .extracting("modelId")
            .containsExactly("gpt-4o-mini");
        assertThat(result.enabledModels()).containsExactly("gpt-4o-mini");
    }

    @Test
    void listAiModelsReturnsNoEnabledModelsWhenExternalAvailabilityIsEmpty() {
        ports.addModel(new AiModel("gpt-4o-mini", "GPT-4o mini", "openai", null));

        var result = service.listAiModels(new ListAiModelsQuery("user-1"));

        assertThat(result.models())
            .extracting("modelId")
            .containsExactly("gpt-4o-mini");
        assertThat(result.enabledModels()).isEmpty();
    }

    @Test
    void putAiModelSettingsSavesExistingDefaultModel() {
        ports.addModel(new AiModel("gpt-4o-mini", "GPT-4o mini", "openai", null));

        var result = service.putAiModelSettings(new PutAiModelSettingsCommand(
            "user-1",
            "gpt-4o-mini",
            Map.of("openai", Map.of("masked", true))
        ));

        assertThat(result.settings()).containsEntry("defaultModelId", "gpt-4o-mini");
        assertThat(ports.findSettingsByUserId("user-1"))
            .get()
            .extracting(AiModelSettings::defaultModelId)
            .isEqualTo("gpt-4o-mini");
    }

    @Test
    void putAiModelSettingsFailsForUnknownDefaultModel() {
        assertThatThrownBy(() -> service.putAiModelSettings(new PutAiModelSettingsCommand(
            "user-1",
            "missing-model",
            Map.of()
        )))
            .isInstanceOf(UnknownAiModelException.class)
            .hasMessageContaining("missing-model");
    }

    @Test
    void putAndGetStyleProfile() {
        var putResult = service.putStyleProfile(new PutStyleProfileCommand(
            "user-1",
            Map.of("speechLevel", "haeyo", "directness", "high"),
            Map.of("formality", "business", "sentenceLength", "short"),
            Map.of("clarificationPolicy", "only_when_blocking")
        ));

        assertThat(putResult.conversationTone()).containsEntry("directness", "high");
        assertThat(putResult.writingStyle()).containsEntry("formality", "business");
        assertThat(putResult.assistanceStyle()).containsEntry("clarificationPolicy", "only_when_blocking");
        assertThat(putResult.detectedFromNotesAt()).isNull();

        var getResult = service.getStyleProfile(new GetStyleProfileQuery("user-1"));

        assertThat(getResult.conversationTone()).containsEntry("speechLevel", "haeyo");
        assertThat(getResult.writingStyle()).containsEntry("sentenceLength", "short");
        assertThat(getResult.assistanceStyle()).containsEntry("clarificationPolicy", "only_when_blocking");
        assertThat(getResult.detectedFromNotesAt()).isNull();
    }

    @Test
    void getStyleProfileReturnsEmptyProfileWhenMissing() {
        var result = service.getStyleProfile(new GetStyleProfileQuery("user-1"));

        assertThat(result.conversationTone()).isEmpty();
        assertThat(result.writingStyle()).isEmpty();
        assertThat(result.assistanceStyle()).isEmpty();
        assertThat(result.detectedFromNotesAt()).isNull();
    }

    private static final class InMemorySettingsPorts
        implements AiModelCatalogPort, AiModelAvailabilityPort, AiModelSettingsPort, StyleProfilePort {

        private final List<AiModel> models = new ArrayList<>();
        private List<String> enabledModelIds = List.of();
        private final Map<String, AiModelSettings> settingsByUserId = new LinkedHashMap<>();
        private final Map<String, StyleProfile> styleProfilesByUserId = new LinkedHashMap<>();

        void addModel(AiModel model) {
            models.add(model);
        }

        void enableModels(String... modelIds) {
            enabledModelIds = List.of(modelIds);
        }

        @Override
        public List<AiModel> findAll() {
            return List.copyOf(models);
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return models.stream().anyMatch(model -> model.modelId().equals(modelId));
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return models.stream()
                .filter(model -> model.modelId().equals(modelId))
                .findFirst();
        }

        @Override
        public AiModelAvailabilityPolicy resolveAvailability(AiModelAvailabilityQuery query) {
            return new AiModelAvailabilityPolicy(enabledModelIds);
        }

        @Override
        public AiModelSettings save(AiModelSettings settings) {
            settingsByUserId.put(settings.userId(), settings);
            return settings;
        }

        @Override
        public Optional<AiModelSettings> findSettingsByUserId(String userId) {
            return Optional.ofNullable(settingsByUserId.get(userId));
        }

        @Override
        public StyleProfile save(StyleProfile styleProfile) {
            styleProfilesByUserId.put(styleProfile.userId(), styleProfile);
            return styleProfile;
        }

        @Override
        public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
            return Optional.ofNullable(styleProfilesByUserId.get(userId));
        }
    }
}
