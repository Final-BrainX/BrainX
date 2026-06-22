package com.brainx.intelligence.infrastructure.dev.rag;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.shared.domain.DocumentGroups;

@Component
@ConfigurationProperties(prefix = "brainx.dev.sample-rag")
public class SampleRagProperties {

    private boolean enabled;
    private String command = "ingest";
    private Path directory = Path.of("sample_notes");
    private String userId = "sample-user";
    private String documentGroupId = DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID;
    private String folderId = "sample_notes";
    private List<String> tags = new ArrayList<>(List.of("sample_notes"));
    private String query = "";
    private int topK = 8;
    private double minScore = 0.35d;
    private int maxChunksPerNote = 2;
    private int maxContextChars = 8_000;
    private String chatModel = "gpt-5.4-mini";

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

    public Path getDirectory() {
        return directory;
    }

    public void setDirectory(Path directory) {
        this.directory = directory;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDocumentGroupId() {
        return DocumentGroups.normalize(documentGroupId);
    }

    public void setDocumentGroupId(String documentGroupId) {
        this.documentGroupId = DocumentGroups.normalize(documentGroupId);
    }

    public String getFolderId() {
        return folderId;
    }

    public void setFolderId(String folderId) {
        this.folderId = folderId;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags == null ? new ArrayList<>() : new ArrayList<>(tags);
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public int getTopK() {
        return topK;
    }

    public void setTopK(int topK) {
        this.topK = topK;
    }

    public double getMinScore() {
        return minScore;
    }

    public void setMinScore(double minScore) {
        if (Double.isNaN(minScore) || Double.isInfinite(minScore)) {
            throw new IllegalArgumentException("minScore must be finite.");
        }
        this.minScore = minScore;
    }

    public int getMaxChunksPerNote() {
        return maxChunksPerNote;
    }

    public void setMaxChunksPerNote(int maxChunksPerNote) {
        this.maxChunksPerNote = Math.max(1, maxChunksPerNote);
    }

    public int getMaxContextChars() {
        return maxContextChars;
    }

    public void setMaxContextChars(int maxContextChars) {
        this.maxContextChars = maxContextChars;
    }

    public String getChatModel() {
        return chatModel;
    }

    public void setChatModel(String chatModel) {
        this.chatModel = chatModel;
    }
}
