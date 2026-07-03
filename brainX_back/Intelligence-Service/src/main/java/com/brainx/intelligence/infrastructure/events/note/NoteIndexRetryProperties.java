package com.brainx.intelligence.infrastructure.events.note;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.note-index.retry")
public class NoteIndexRetryProperties {

    private boolean enabled = true;
    private Duration fixedDelay = Duration.ofMinutes(5);
    private int batchSize = 20;
    private int maxAttempts = 10;
    private Duration exhaustedDelay = Duration.ofHours(24);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Duration getFixedDelay() {
        return fixedDelay;
    }

    public void setFixedDelay(Duration fixedDelay) {
        this.fixedDelay = fixedDelay == null || fixedDelay.isNegative() || fixedDelay.isZero()
            ? Duration.ofMinutes(5)
            : fixedDelay;
    }

    public int getBatchSize() {
        return Math.max(1, batchSize);
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = Math.max(1, batchSize);
    }

    public int getMaxAttempts() {
        return Math.max(1, maxAttempts);
    }

    public void setMaxAttempts(int maxAttempts) {
        this.maxAttempts = Math.max(1, maxAttempts);
    }

    public Duration getExhaustedDelay() {
        return exhaustedDelay;
    }

    public void setExhaustedDelay(Duration exhaustedDelay) {
        this.exhaustedDelay = exhaustedDelay == null || exhaustedDelay.isNegative() || exhaustedDelay.isZero()
            ? Duration.ofHours(24)
            : exhaustedDelay;
    }
}
