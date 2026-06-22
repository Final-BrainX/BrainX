package com.brainx.intelligence.settings.application.port.inbound;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 사용 가능한 AI 모델 목록을 조회합니다.
 */
public interface ListAiModelsUseCase {

    AiModelsResult listAiModels(ListAiModelsQuery query);

    record ListAiModelsQuery(
        String userId
    ) {
    }

    record AiModelsResult(
        List<AiModelView> models,
        List<String> enabledModels,
        AiPricingPolicyView costInfo
    ) {
    }

    record AiModelView(
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

    record AiPricingPolicyView(
        String billingUnit,
        String summary,
        Map<String, Object> details
    ) {
    }
}
