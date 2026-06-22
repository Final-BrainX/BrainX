package com.brainx.intelligence.infrastructure.events.producer;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.events.producer")
public class BrainxEventProducerProperties {

    private boolean enabled;
    private String semanticSearchPerformedTopic = "brainx.knowledge.intelligence.semantic-search-performed.v1";
    private String tokenUsageRecordedRequestedTopic = "brainx.knowledge.intelligence.token-usage-recorded-requested.v1";
    private String aiSuggestionCreatedTopic = "brainx.knowledge.intelligence.ai-suggestion-created.v1";
    private String aiSuggestionDecisionRecordedTopic =
        "brainx.knowledge.intelligence.ai-suggestion-decision-recorded.v1";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getSemanticSearchPerformedTopic() {
        return semanticSearchPerformedTopic;
    }

    public void setSemanticSearchPerformedTopic(String semanticSearchPerformedTopic) {
        this.semanticSearchPerformedTopic = semanticSearchPerformedTopic;
    }

    public String getTokenUsageRecordedRequestedTopic() {
        return tokenUsageRecordedRequestedTopic;
    }

    public void setTokenUsageRecordedRequestedTopic(String tokenUsageRecordedRequestedTopic) {
        this.tokenUsageRecordedRequestedTopic = tokenUsageRecordedRequestedTopic;
    }

    public String getAiSuggestionCreatedTopic() {
        return aiSuggestionCreatedTopic;
    }

    public void setAiSuggestionCreatedTopic(String aiSuggestionCreatedTopic) {
        this.aiSuggestionCreatedTopic = aiSuggestionCreatedTopic;
    }

    public String getAiSuggestionDecisionRecordedTopic() {
        return aiSuggestionDecisionRecordedTopic;
    }

    public void setAiSuggestionDecisionRecordedTopic(String aiSuggestionDecisionRecordedTopic) {
        this.aiSuggestionDecisionRecordedTopic = aiSuggestionDecisionRecordedTopic;
    }
}
