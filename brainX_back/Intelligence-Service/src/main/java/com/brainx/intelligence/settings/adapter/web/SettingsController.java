package com.brainx.intelligence.settings.adapter.web;

import java.math.BigDecimal;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase.GetStyleProfileQuery;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.ListAiModelsQuery;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase.PutAiModelSettingsCommand;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase.PutStyleProfileCommand;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

/**
 * AI 사용 준비 settings API adapter입니다.
 */
@RestController
@Validated
public class SettingsController {

    private final ListAiModelsUseCase listAiModelsUseCase;
    private final PutAiModelSettingsUseCase putAiModelSettingsUseCase;
    private final GetStyleProfileUseCase getStyleProfileUseCase;
    private final PutStyleProfileUseCase putStyleProfileUseCase;

    public SettingsController(
        ListAiModelsUseCase listAiModelsUseCase,
        PutAiModelSettingsUseCase putAiModelSettingsUseCase,
        GetStyleProfileUseCase getStyleProfileUseCase,
        PutStyleProfileUseCase putStyleProfileUseCase
    ) {
        this.listAiModelsUseCase = listAiModelsUseCase;
        this.putAiModelSettingsUseCase = putAiModelSettingsUseCase;
        this.getStyleProfileUseCase = getStyleProfileUseCase;
        this.putStyleProfileUseCase = putStyleProfileUseCase;
    }

    @GetMapping("/api/v1/ai/models")
    public ApiSuccessResponse<AiModelsData> listAiModels(Principal principal) {
        var result = listAiModelsUseCase.listAiModels(new ListAiModelsQuery(userId(principal)));

        List<AiModelData> models = result.models().stream()
            .map(model -> new AiModelData(
                model.modelId(),
                model.name(),
                model.provider(),
                model.vendorInputCostPer1kTokens(),
                model.vendorCachedInputCostPer1kTokens(),
                model.vendorOutputCostPer1kTokens(),
                model.costCurrency(),
                model.enabled()
            ))
            .toList();

        return ApiSuccessResponse.ok(new AiModelsData(
            models,
            result.enabledModels(),
            result.costInfo()
        ));
    }

    @PutMapping("/api/v1/ai/model-settings")
    public ApiSuccessResponse<AiModelSettingsData> putAiModelSettings(
        Principal principal,
        @Valid @RequestBody AiModelSettingsPutRequest request
    ) {
        var result = putAiModelSettingsUseCase.putAiModelSettings(new PutAiModelSettingsCommand(
            userId(principal),
            request.defaultModelId(),
            nullToEmpty(request.userApiKeys())
        ));

        return ApiSuccessResponse.ok(new AiModelSettingsData(result.settings()));
    }

    @GetMapping("/api/v1/users/me/style-profile")
    public ApiSuccessResponse<StyleProfileData> getStyleProfile(Principal principal) {
        var result = getStyleProfileUseCase.getStyleProfile(new GetStyleProfileQuery(userId(principal)));

        return ApiSuccessResponse.ok(new StyleProfileData(
            result.conversationTone(),
            result.writingStyle(),
            result.assistanceStyle(),
            result.detectedFromNotesAt()
        ));
    }

    @PutMapping("/api/v1/users/me/style-profile")
    public ApiSuccessResponse<StyleProfileData> putStyleProfile(
        Principal principal,
        @RequestBody StyleProfilePutRequest request
    ) {
        var result = putStyleProfileUseCase.putStyleProfile(new PutStyleProfileCommand(
            userId(principal),
            nullToEmpty(request.conversationTone()),
            nullToEmpty(request.writingStyle()),
            nullToEmpty(request.assistanceStyle())
        ));

        return ApiSuccessResponse.ok(new StyleProfileData(
            result.conversationTone(),
            result.writingStyle(),
            result.assistanceStyle(),
            result.detectedFromNotesAt()
        ));
    }

    private static String userId(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getName() != null && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        throw new IllegalArgumentException("Authenticated user is required.");
    }

    private static Map<String, Object> nullToEmpty(Map<String, Object> values) {
        return values == null ? Map.of() : values;
    }

    record AiModelsData(
        List<AiModelData> models,
        List<String> enabledModels,
        Object costInfo
    ) {
    }

    record AiModelData(
        String modelId,
        String name,
        String provider,
        BigDecimal vendorInputCostPer1kTokens,
        BigDecimal vendorCachedInputCostPer1kTokens,
        BigDecimal vendorOutputCostPer1kTokens,
        String costCurrency,
        boolean enabled
    ) {
    }

    record AiModelSettingsPutRequest(
        @NotBlank String defaultModelId,
        Map<String, Object> userApiKeys
    ) {
    }

    record AiModelSettingsData(
        Map<String, Object> settings
    ) {
    }

    record StyleProfilePutRequest(
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle,
        Map<String, Object> assistanceStyle
    ) {
    }

    record StyleProfileData(
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle,
        Map<String, Object> assistanceStyle,
        Instant detectedFromNotesAt
    ) {
    }
}
