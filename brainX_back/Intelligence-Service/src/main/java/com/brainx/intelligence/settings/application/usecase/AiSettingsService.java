package com.brainx.intelligence.settings.application.usecase;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.outbound.AiModelAvailabilityPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelAvailabilityPort.AiModelAvailabilityQuery;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.domain.AiPricingPolicy;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelAvailabilityPolicy;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.AssistanceStyle;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.SettingsValidation;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.UnknownAiModelException;
import com.brainx.intelligence.settings.domain.WritingStyle;

/**
 * AI 사용 준비 기능의 application service입니다.
 */
@Service
@Transactional
public class AiSettingsService implements
    ListAiModelsUseCase,
    PutAiModelSettingsUseCase,
    GetStyleProfileUseCase,
    PutStyleProfileUseCase {

    private final AiModelCatalogPort aiModelCatalogPort;
    private final AiModelAvailabilityPort aiModelAvailabilityPort;
    private final AiModelSettingsPort aiModelSettingsPort;
    private final StyleProfilePort styleProfilePort;

    public AiSettingsService(
        AiModelCatalogPort aiModelCatalogPort,
        AiModelAvailabilityPort aiModelAvailabilityPort,
        AiModelSettingsPort aiModelSettingsPort,
        StyleProfilePort styleProfilePort
    ) {
        this.aiModelCatalogPort = aiModelCatalogPort;
        this.aiModelAvailabilityPort = aiModelAvailabilityPort;
        this.aiModelSettingsPort = aiModelSettingsPort;
        this.styleProfilePort = styleProfilePort;
    }

    @Override
    @Transactional(readOnly = true)
    public AiModelsResult listAiModels(ListAiModelsQuery query) {
        String userId = SettingsValidation.requireText(query.userId(), "userId");
        List<AiModel> models = aiModelCatalogPort.findAll();
        List<String> catalogModelIds = models.stream()
            .map(AiModel::modelId)
            .toList();
        AiModelAvailabilityPolicy availabilityPolicy = aiModelAvailabilityPort.resolveAvailability(
            new AiModelAvailabilityQuery(userId, catalogModelIds)
        );
        List<String> enabledModels = availabilityPolicy.enabledModelIds().stream()
            .filter(catalogModelIds::contains)
            .toList();
        Set<String> enabledModelIds = new LinkedHashSet<>(enabledModels);
        List<AiModelView> modelViews = models.stream()
            .map(model -> new AiModelView(
                model.modelId(),
                model.name(),
                model.provider(),
                model.vendorTokenCost().inputCostPer1kTokens(),
                model.vendorTokenCost().cachedInputCostPer1kTokens(),
                model.vendorTokenCost().outputCostPer1kTokens(),
                model.vendorTokenCost().currencyCode(),
                enabledModelIds.contains(model.modelId())
            ))
            .toList();

        return new AiModelsResult(modelViews, enabledModels, pricingPolicyView(AiPricingPolicy.defaultTokenPolicy()));
    }

    @Override
    public AiModelSettingsResult putAiModelSettings(PutAiModelSettingsCommand command) {
        String userId = SettingsValidation.requireText(command.userId(), "userId");
        String defaultModelId = SettingsValidation.requireText(command.defaultModelId(), "defaultModelId");
        if (!aiModelCatalogPort.existsByModelId(defaultModelId)) {
            throw new UnknownAiModelException(defaultModelId);
        }

        AiModelSettings savedSettings = aiModelSettingsPort.save(
            new AiModelSettings(userId, defaultModelId, command.userApiKeys())
        );

        return new AiModelSettingsResult(settingsMap(savedSettings));
    }

    @Override
    @Transactional(readOnly = true)
    public GetStyleProfileUseCase.StyleProfileResult getStyleProfile(GetStyleProfileQuery query) {
        String userId = SettingsValidation.requireText(query.userId(), "userId");
        StyleProfile styleProfile = styleProfilePort.findStyleProfileByUserId(userId)
            .orElseGet(() -> StyleProfile.empty(userId));

        return new GetStyleProfileUseCase.StyleProfileResult(
            styleProfile.conversationToneValues(),
            styleProfile.writingStyleValues(),
            styleProfile.assistanceStyleValues(),
            styleProfile.detectedFromNotesAt()
        );
    }

    @Override
    public PutStyleProfileUseCase.StyleProfileResult putStyleProfile(PutStyleProfileCommand command) {
        String userId = SettingsValidation.requireText(command.userId(), "userId");
        StyleProfile savedProfile = styleProfilePort.save(new StyleProfile(
            userId,
            new ConversationTone(command.conversationTone()),
            new WritingStyle(command.writingStyle()),
            new AssistanceStyle(command.assistanceStyle()),
            null
        ));

        return new PutStyleProfileUseCase.StyleProfileResult(
            savedProfile.conversationToneValues(),
            savedProfile.writingStyleValues(),
            savedProfile.assistanceStyleValues(),
            savedProfile.detectedFromNotesAt()
        );
    }

    private static Map<String, Object> settingsMap(AiModelSettings settings) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("defaultModelId", settings.defaultModelId());
        values.put("userApiKeys", settings.userApiKeys());
        return Map.copyOf(values);
    }

    private static AiPricingPolicyView pricingPolicyView(AiPricingPolicy policy) {
        return new AiPricingPolicyView(policy.billingUnit(), policy.summary(), policy.details());
    }
}
