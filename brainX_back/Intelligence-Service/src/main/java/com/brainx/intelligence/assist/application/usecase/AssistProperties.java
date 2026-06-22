package com.brainx.intelligence.assist.application.usecase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "brainx.assist")
public class AssistProperties {

    private String defaultModel = "gpt-5.4-mini";

    public String getDefaultModel() {
        return defaultModel;
    }

    public void setDefaultModel(String defaultModel) {
        if (StringUtils.hasText(defaultModel)) {
            this.defaultModel = defaultModel.trim();
        }
    }
}
