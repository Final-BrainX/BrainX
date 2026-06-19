package com.brainx.intelligence.infrastructure.events.consumer;

public enum EventConsumptionStatus {
    PROCESSING,
    PROCESSED,
    FAILED_RETRYABLE,
    FAILED_NON_RETRYABLE
}
