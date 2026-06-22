package com.brainx.intelligence.settings.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class AiModelTest {

    @Test
    void preservesVendorInputAndOutputCost() {
        VendorTokenCost vendorTokenCost = new VendorTokenCost(
            new BigDecimal("0.150000"),
            new BigDecimal("0.075000"),
            new BigDecimal("0.600000"),
            "usd"
        );

        AiModel model = new AiModel("gpt-4o-mini", "GPT-4o mini", "openai", vendorTokenCost);

        assertThat(model.vendorTokenCost()).isEqualTo(vendorTokenCost);
        assertThat(model.vendorTokenCost().currencyCode()).isEqualTo("USD");
    }

    @Test
    void defaultsUnknownVendorCostWhenNull() {
        AiModel model = new AiModel("gpt-4o-mini", "GPT-4o mini", "openai", null);

        assertThat(model.vendorTokenCost()).isEqualTo(VendorTokenCost.unknown());
    }
}
