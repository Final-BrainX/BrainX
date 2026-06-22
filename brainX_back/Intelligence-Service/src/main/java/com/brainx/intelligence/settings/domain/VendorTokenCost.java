package com.brainx.intelligence.settings.domain;

import java.math.BigDecimal;

/**
 * 벤더사 모델의 입력/캐시 입력/출력 토큰 기준 단가입니다.
 */
public record VendorTokenCost(
    BigDecimal inputCostPer1kTokens,
    BigDecimal cachedInputCostPer1kTokens,
    BigDecimal outputCostPer1kTokens,
    String currencyCode
) {

    public static final String DEFAULT_CURRENCY_CODE = "USD";

    public VendorTokenCost {
        validateNonNegative(inputCostPer1kTokens, "inputCostPer1kTokens");
        validateNonNegative(cachedInputCostPer1kTokens, "cachedInputCostPer1kTokens");
        validateNonNegative(outputCostPer1kTokens, "outputCostPer1kTokens");
        currencyCode = currencyCode == null || currencyCode.isBlank()
            ? DEFAULT_CURRENCY_CODE
            : currencyCode.trim().toUpperCase();
    }

    public VendorTokenCost(
        BigDecimal inputCostPer1kTokens,
        BigDecimal outputCostPer1kTokens
    ) {
        this(inputCostPer1kTokens, null, outputCostPer1kTokens, DEFAULT_CURRENCY_CODE);
    }

    public static VendorTokenCost unknown() {
        return new VendorTokenCost(null, null, null, DEFAULT_CURRENCY_CODE);
    }

    private static void validateNonNegative(BigDecimal value, String name) {
        if (value != null && value.signum() < 0) {
            throw new SettingsDomainException(name + " must not be negative.");
        }
    }
}
