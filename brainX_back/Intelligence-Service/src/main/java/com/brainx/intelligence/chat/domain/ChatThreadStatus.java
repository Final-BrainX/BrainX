package com.brainx.intelligence.chat.domain;

public enum ChatThreadStatus {
    ACTIVE,
    ARCHIVED;

    public static ChatThreadStatus fromNullable(String value) {
        if (value == null || value.isBlank()) {
            return ACTIVE;
        }
        return switch (value.trim().toLowerCase()) {
            case "active" -> ACTIVE;
            case "archived" -> ARCHIVED;
            default -> throw new ChatDomainException("Invalid chat thread status: " + value);
        };
    }
}
