package com.brainx.intelligence.clustering.domain;

public class ClusteringIdempotencyConflictException extends ClusteringConflictException {

    public ClusteringIdempotencyConflictException(String message) {
        super(message);
    }
}
