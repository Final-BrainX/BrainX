package com.brainx.intelligence.exploration.application.usecase;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "brainx.semantic-search")
public class SemanticSearchProperties {

    private double minScore = 0.35d;

    public double getMinScore() {
        return minScore;
    }

    public void setMinScore(double minScore) {
        if (Double.isNaN(minScore) || Double.isInfinite(minScore) || minScore < 0.0d || minScore > 1.0d) {
            throw new IllegalArgumentException("minScore must be between 0.0 and 1.0.");
        }
        this.minScore = minScore;
    }
}
