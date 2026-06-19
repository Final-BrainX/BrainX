package com.brainx.intelligence.exploration.domain;

public record TokenChargeDecision(
    boolean charged,
    Integer tokenEstimate
) {

    public TokenChargeDecision {
        if (tokenEstimate != null && tokenEstimate < 0) {
            throw new ExplorationDomainException("tokenEstimate must not be negative.");
        }
    }

    public static TokenChargeDecision charged(int tokenEstimate) {
        return new TokenChargeDecision(true, tokenEstimate);
    }

    public static TokenChargeDecision notCharged(Integer tokenEstimate) {
        return new TokenChargeDecision(false, tokenEstimate);
    }
}
