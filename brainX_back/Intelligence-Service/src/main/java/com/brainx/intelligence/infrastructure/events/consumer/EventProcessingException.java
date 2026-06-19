package com.brainx.intelligence.infrastructure.events.consumer;

public class EventProcessingException extends RuntimeException {

    private final boolean retryable;
    private final String errorCode;

    public EventProcessingException(boolean retryable, String errorCode, String message) {
        super(message);
        this.retryable = retryable;
        this.errorCode = errorCode;
    }

    public static EventProcessingException retryable(String errorCode, String message) {
        return new EventProcessingException(true, errorCode, message);
    }

    public static EventProcessingException nonRetryable(String errorCode, String message) {
        return new EventProcessingException(false, errorCode, message);
    }

    public boolean retryable() {
        return retryable;
    }

    public String errorCode() {
        return errorCode;
    }
}
