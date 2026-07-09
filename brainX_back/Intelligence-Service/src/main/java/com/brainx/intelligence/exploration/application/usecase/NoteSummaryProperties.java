package com.brainx.intelligence.exploration.application.usecase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "brainx.note-summary")
public class NoteSummaryProperties {

    private String model = "gpt-5.4-nano";

    public String getModel() {
        return StringUtils.hasText(model) ? model.trim() : "gpt-5.4-nano";
    }

    public void setModel(String model) {
        if (StringUtils.hasText(model)) {
            this.model = model.trim();
        }
    }
}
