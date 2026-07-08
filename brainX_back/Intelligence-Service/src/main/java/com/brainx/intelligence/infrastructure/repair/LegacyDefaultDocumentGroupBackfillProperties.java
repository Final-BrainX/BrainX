package com.brainx.intelligence.infrastructure.repair;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "brainx.repair.legacy-default-document-group-backfill")
public class LegacyDefaultDocumentGroupBackfillProperties {

    private boolean enabled;
    private int batchSize = 200;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    int normalizedBatchSize() {
        return Math.max(1, Math.min(batchSize, 1000));
    }
}
