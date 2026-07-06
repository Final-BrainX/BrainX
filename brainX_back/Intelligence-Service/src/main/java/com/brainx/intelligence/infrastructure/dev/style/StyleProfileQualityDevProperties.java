package com.brainx.intelligence.infrastructure.dev.style;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.dev.style-profile-quality")
public class StyleProfileQualityDevProperties {

    private boolean enabled;
    private String command = "run";
    private String userId = "sample-style-user";
    private String noteId = "sample-style-note";
    private String modelId = "gpt-5.4-mini";
    private String judgeModelId = "gpt-5.4-mini";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCommand() {
        return command;
    }

    public void setCommand(String command) {
        this.command = command == null ? "" : command;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getNoteId() {
        return noteId;
    }

    public void setNoteId(String noteId) {
        this.noteId = noteId;
    }

    public String getModelId() {
        return modelId;
    }

    public void setModelId(String modelId) {
        this.modelId = modelId;
    }

    public String getJudgeModelId() {
        return judgeModelId;
    }

    public void setJudgeModelId(String judgeModelId) {
        this.judgeModelId = judgeModelId;
    }
}
