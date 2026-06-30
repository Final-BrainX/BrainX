package com.brainx.intelligence.infrastructure.dev.assist;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.dev.inline-assist")
public class InlineAssistDevProperties {

    private boolean enabled;
    private String command = "run";
    private String userId = "sample-user";
    private String noteId = "sample-inline-assist";
    private String action = "";
    private String selectedText = "";
    private String contextBefore = "";
    private String contextAfter = "";
    private String language = "ko";
    private String draftPrompt = "";
    private Integer targetLength;

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
        this.command = command;
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

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action == null ? "" : action;
    }

    public String getSelectedText() {
        return selectedText;
    }

    public void setSelectedText(String selectedText) {
        this.selectedText = selectedText == null ? "" : selectedText;
    }

    public String getContextBefore() {
        return contextBefore;
    }

    public void setContextBefore(String contextBefore) {
        this.contextBefore = contextBefore == null ? "" : contextBefore;
    }

    public String getContextAfter() {
        return contextAfter;
    }

    public void setContextAfter(String contextAfter) {
        this.contextAfter = contextAfter == null ? "" : contextAfter;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language == null ? "" : language;
    }

    public String getDraftPrompt() {
        return draftPrompt;
    }

    public void setDraftPrompt(String draftPrompt) {
        this.draftPrompt = draftPrompt == null ? "" : draftPrompt;
    }

    public Integer getTargetLength() {
        return targetLength;
    }

    public void setTargetLength(Integer targetLength) {
        this.targetLength = targetLength;
    }
}
