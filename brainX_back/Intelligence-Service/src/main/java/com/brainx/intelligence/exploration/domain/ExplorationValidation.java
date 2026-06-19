package com.brainx.intelligence.exploration.domain;

final class ExplorationValidation {

    private ExplorationValidation() {
    }

    static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ExplorationDomainException(name + " must not be blank.");
        }
        return value;
    }
}
