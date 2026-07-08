package com.brainx.intelligence.exploration.domain;

public enum SearchMode {
    SEMANTIC,
    KEYWORD,
    HYBRID;

    public static SearchMode normalize(String value) {
        if (value == null || value.isBlank()) {
            return SEMANTIC;
        }
        try {
            return SearchMode.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new ExplorationDomainException("Unsupported search mode: " + value);
        }
    }
}
