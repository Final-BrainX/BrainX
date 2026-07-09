package com.brainx.intelligence.insight.domain;

public class InsightIdempotencyConflictException extends InsightConflictException {

    public InsightIdempotencyConflictException(String message) {
        super(message);
    }
}
