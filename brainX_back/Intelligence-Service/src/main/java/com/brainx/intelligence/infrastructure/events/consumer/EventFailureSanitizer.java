package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.regex.Pattern;

final class EventFailureSanitizer {

    private static final int MAX_MESSAGE_LENGTH = 240;
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._\\-]+");
    private static final Pattern VOYAGE_KEY = Pattern.compile("pa-[A-Za-z0-9_\\-]+");

    private EventFailureSanitizer() {
    }

    static String safeMessage(Throwable exception) {
        if (exception == null) {
            return "";
        }
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return exception.getClass().getSimpleName();
        }
        return truncate(redact(message));
    }

    static String safeMessage(String message) {
        if (message == null || message.isBlank()) {
            return "";
        }
        return truncate(redact(message));
    }

    private static String redact(String value) {
        String redacted = BEARER_TOKEN.matcher(value).replaceAll("Bearer [REDACTED]");
        return VOYAGE_KEY.matcher(redacted).replaceAll("[REDACTED]");
    }

    private static String truncate(String value) {
        String singleLine = value.replaceAll("\\s+", " ").trim();
        if (singleLine.length() <= MAX_MESSAGE_LENGTH) {
            return singleLine;
        }
        return singleLine.substring(0, MAX_MESSAGE_LENGTH).trim();
    }
}
