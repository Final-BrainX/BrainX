package com.brainx.intelligence.chat.application.usecase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "brainx.chat.title")
public class ChatTitleProperties {

    private boolean enabled = true;
    private String model = "gpt-5.4-nano";
    private int maxLength = 20;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getModel() {
        return StringUtils.hasText(model) ? model.trim() : "gpt-5.4-nano";
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getMaxLength() {
        return maxLength;
    }

    public void setMaxLength(int maxLength) {
        this.maxLength = Math.max(8, Math.min(80, maxLength));
    }
}
