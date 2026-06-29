package com.brainx.intelligence.organization.application.usecase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "brainx.organization")
public class OrganizationProperties {

    private String defaultModel = "gpt-5.4-mini";
    private int maxNotes = 50;
    private int maxProposedFolders = 8;
    private int maxProposedMoves = 20;

    public String getDefaultModel() {
        return defaultModel;
    }

    public void setDefaultModel(String defaultModel) {
        if (StringUtils.hasText(defaultModel)) {
            this.defaultModel = defaultModel.trim();
        }
    }

    public int getMaxNotes() {
        return Math.max(1, maxNotes);
    }

    public void setMaxNotes(int maxNotes) {
        this.maxNotes = maxNotes;
    }

    public int getMaxProposedFolders() {
        return Math.max(1, maxProposedFolders);
    }

    public void setMaxProposedFolders(int maxProposedFolders) {
        this.maxProposedFolders = maxProposedFolders;
    }

    public int getMaxProposedMoves() {
        return Math.max(1, maxProposedMoves);
    }

    public void setMaxProposedMoves(int maxProposedMoves) {
        this.maxProposedMoves = maxProposedMoves;
    }
}
