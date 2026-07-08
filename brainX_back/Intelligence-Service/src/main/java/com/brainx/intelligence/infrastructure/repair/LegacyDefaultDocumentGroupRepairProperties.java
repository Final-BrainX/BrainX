package com.brainx.intelligence.infrastructure.repair;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "brainx.repair.legacy-default-document-group-vectors")
public class LegacyDefaultDocumentGroupRepairProperties {

    private boolean enabled;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
