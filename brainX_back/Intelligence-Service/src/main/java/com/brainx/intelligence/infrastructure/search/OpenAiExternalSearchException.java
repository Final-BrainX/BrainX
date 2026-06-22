package com.brainx.intelligence.infrastructure.search;

public class OpenAiExternalSearchException extends RuntimeException {

    public OpenAiExternalSearchException(String message) {
        super(message);
    }

    public OpenAiExternalSearchException(String message, Throwable cause) {
        super(message, cause);
    }
}
