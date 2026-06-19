package com.brainx.intelligence.infrastructure.ai.voyage;

public class VoyageEmbeddingException extends RuntimeException {

    public VoyageEmbeddingException(String message) {
        super(message);
    }

    public VoyageEmbeddingException(String message, Throwable cause) {
        super(message, cause);
    }
}
