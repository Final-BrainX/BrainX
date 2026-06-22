package com.brainx.intelligence.shared.application.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.VendorTokenCost;

/**
 * Catalog에 저장된 vendor token 단가로 AI 사용량의 추정 원가를 계산합니다.
 */
@Service
public class AiTokenUsageCostEstimator {

    private static final BigDecimal ONE_THOUSAND = BigDecimal.valueOf(1_000L);

    private final AiModelCatalogPort aiModelCatalogPort;

    public AiTokenUsageCostEstimator(AiModelCatalogPort aiModelCatalogPort) {
        this.aiModelCatalogPort = aiModelCatalogPort;
    }

    @Transactional(readOnly = true)
    public TokenCostEstimate estimate(
        String modelId,
        int inputTokens,
        int cachedInputTokens,
        int outputTokens
    ) {
        if (!StringUtils.hasText(modelId)) {
            return TokenCostEstimate.unknown();
        }
        return aiModelCatalogPort.findByModelId(modelId)
            .map(model -> estimate(model.vendorTokenCost(), inputTokens, cachedInputTokens, outputTokens))
            .orElseGet(TokenCostEstimate::unknown);
    }

    private static TokenCostEstimate estimate(
        VendorTokenCost cost,
        int inputTokens,
        int cachedInputTokens,
        int outputTokens
    ) {
        int normalizedInputTokens = Math.max(0, inputTokens);
        int normalizedCachedInputTokens = Math.max(0, Math.min(cachedInputTokens, normalizedInputTokens));
        int billableInputTokens = normalizedInputTokens - normalizedCachedInputTokens;
        int normalizedOutputTokens = Math.max(0, outputTokens);

        BigDecimal inputCost = costForTokens(billableInputTokens, cost.inputCostPer1kTokens());
        BigDecimal cachedInputCost = costForTokens(
            normalizedCachedInputTokens,
            cachedInputRate(cost)
        );
        BigDecimal outputCost = costForTokens(normalizedOutputTokens, cost.outputCostPer1kTokens());
        BigDecimal totalCost = sumIfComplete(inputCost, cachedInputCost, outputCost);

        return new TokenCostEstimate(
            inputCost,
            cachedInputCost,
            outputCost,
            totalCost,
            totalCost == null ? null : cost.currencyCode()
        );
    }

    private static BigDecimal cachedInputRate(VendorTokenCost cost) {
        return cost.cachedInputCostPer1kTokens() == null
            ? cost.inputCostPer1kTokens()
            : cost.cachedInputCostPer1kTokens();
    }

    private static BigDecimal costForTokens(int tokens, BigDecimal costPer1kTokens) {
        if (tokens <= 0) {
            return BigDecimal.ZERO;
        }
        if (costPer1kTokens == null) {
            return null;
        }
        return costPer1kTokens
            .multiply(BigDecimal.valueOf(tokens))
            .divide(ONE_THOUSAND, 12, RoundingMode.HALF_UP)
            .stripTrailingZeros();
    }

    private static BigDecimal sumIfComplete(BigDecimal... values) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal value : values) {
            if (value == null) {
                return null;
            }
            total = total.add(value);
        }
        return total.stripTrailingZeros();
    }

    public record TokenCostEstimate(
        BigDecimal inputCost,
        BigDecimal cachedInputCost,
        BigDecimal outputCost,
        BigDecimal totalCost,
        String currencyCode
    ) {
        public static TokenCostEstimate unknown() {
            return new TokenCostEstimate(null, null, null, null, null);
        }
    }
}
