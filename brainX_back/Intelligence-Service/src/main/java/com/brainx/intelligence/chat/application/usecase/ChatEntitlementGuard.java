package com.brainx.intelligence.chat.application.usecase;

import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;

final class ChatEntitlementGuard {

    private final EntitlementPort entitlementPort;

    ChatEntitlementGuard(EntitlementPort entitlementPort) {
        this.entitlementPort = entitlementPort;
    }

    void checkRagChat(String userId, int tokenEstimate) {
        var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
            userId,
            ChatService.RAG_CHAT_CAPABILITY,
            tokenEstimate
        ));
        if (!entitlement.allowed()) {
            throw new ChatDomainException("AI capability is not available: " + entitlement.reasonCode());
        }
    }
}
