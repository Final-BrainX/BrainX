package com.brainx.intelligence.settings.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class VendorTokenCostTest {

    @Test
    void allowsNullInputAndOutputCost() {
        VendorTokenCost cost = new VendorTokenCost(null, null);

        assertThat(cost.inputCostPer1kTokens()).isNull();
        assertThat(cost.cachedInputCostPer1kTokens()).isNull();
        assertThat(cost.outputCostPer1kTokens()).isNull();
        assertThat(cost.currencyCode()).isEqualTo("USD");
    }

    @Test
    void rejectsNegativeInputCost() {
        assertThatThrownBy(() -> new VendorTokenCost(new BigDecimal("-0.1"), null))
            .isInstanceOf(SettingsDomainException.class)
            .hasMessageContaining("inputCostPer1kTokens");
    }

    @Test
    void rejectsNegativeOutputCost() {
        assertThatThrownBy(() -> new VendorTokenCost(null, new BigDecimal("-0.1")))
            .isInstanceOf(SettingsDomainException.class)
            .hasMessageContaining("outputCostPer1kTokens");
    }

    @Test
    void rejectsNegativeCachedInputCost() {
        assertThatThrownBy(() -> new VendorTokenCost(
            null,
            new BigDecimal("-0.1"),
            null,
            "USD"
        ))
            .isInstanceOf(SettingsDomainException.class)
            .hasMessageContaining("cachedInputCostPer1kTokens");
    }
}
