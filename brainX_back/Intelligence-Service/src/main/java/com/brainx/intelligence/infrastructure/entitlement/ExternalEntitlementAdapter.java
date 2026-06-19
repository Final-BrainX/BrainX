package com.brainx.intelligence.infrastructure.entitlement;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;

@Component
public class ExternalEntitlementAdapter implements EntitlementPort {

    @Override
    public EntitlementDecision checkEntitlement(EntitlementRequest request) {
        return new EntitlementDecision(true, null, null);
    }
}
