package com.brainx.intelligence.llmops.domain;

public class LlmOpsNotFoundException extends RuntimeException {

    public LlmOpsNotFoundException(String message) {
        super(message);
    }
}
