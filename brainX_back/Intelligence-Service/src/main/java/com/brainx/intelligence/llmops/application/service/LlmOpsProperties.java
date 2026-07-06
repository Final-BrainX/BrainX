package com.brainx.intelligence.llmops.application.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.llmops")
public class LlmOpsProperties {

    private int previewMaxChars = 2_000;

    public int getPreviewMaxChars() {
        return previewMaxChars;
    }

    public void setPreviewMaxChars(int previewMaxChars) {
        if (previewMaxChars > 0) {
            this.previewMaxChars = Math.min(previewMaxChars, 20_000);
        }
    }
}
