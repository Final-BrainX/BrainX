package com.brainx.intelligence.settings.application.service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.domain.StyleProfile;

@Service
public class StylePromptCompiler {

    private static final int MAX_VALUE_LENGTH = 80;
    private static final int MAX_AVOID_ITEMS = 6;
    private static final List<String> CONVERSATION_TONE_KEYS = List.of(
        "speechLevel",
        "warmth",
        "directness",
        "verbosity",
        "emoji"
    );
    private static final List<String> WRITING_STYLE_KEYS = List.of(
        "defaultAudience",
        "defaultPurpose",
        "formality",
        "informationDensity",
        "sentenceLength",
        "avoid"
    );

    private final StyleProfilePort styleProfilePort;

    public StylePromptCompiler(StyleProfilePort styleProfilePort) {
        this.styleProfilePort = styleProfilePort;
    }

    public String conversationToneInstructions(String userId) {
        return styleProfile(userId)
            .map(StyleProfile::conversationToneValues)
            .map(values -> compile(
                "User conversation tone profile",
                "Apply these preferences only to conversational wording. Do not override safety, factuality, evidence limits, JSON schemas, output language, or explicit user instructions.",
                values,
                CONVERSATION_TONE_KEYS
            ))
            .orElse("");
    }

    public String writingStyleInstructions(String userId) {
        return styleProfile(userId)
            .map(StyleProfile::writingStyleValues)
            .map(values -> compile(
                "User writing style profile",
                "Apply these preferences only to generated or edited user-facing text. Current request instructions, source context, target language, and required output schemas take precedence.",
                values,
                WRITING_STYLE_KEYS
            ))
            .orElse("");
    }

    public static String appendToSystemPrompt(String systemPrompt, String styleInstructions) {
        if (!StringUtils.hasText(styleInstructions)) {
            return systemPrompt;
        }
        return systemPrompt + "\n\n" + styleInstructions;
    }

    private Optional<StyleProfile> styleProfile(String userId) {
        if (!StringUtils.hasText(userId)) {
            return Optional.empty();
        }
        return styleProfilePort.findStyleProfileByUserId(userId.trim());
    }

    private static String compile(
        String title,
        String guardrail,
        Map<String, Object> rawValues,
        List<String> allowedKeys
    ) {
        Map<String, String> values = allowedValues(rawValues, allowedKeys);
        if (values.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder(title).append(":\n");
        values.forEach((key, value) -> builder.append("- ")
            .append(key)
            .append(": ")
            .append(value)
            .append('\n'));
        builder.append(guardrail);
        return builder.toString();
    }

    private static Map<String, String> allowedValues(Map<String, Object> rawValues, List<String> allowedKeys) {
        if (rawValues == null || rawValues.isEmpty()) {
            return Map.of();
        }

        Map<String, String> values = new LinkedHashMap<>();
        for (String key : allowedKeys) {
            Object rawValue = rawValues.get(key);
            String value = "avoid".equals(key) ? avoidValue(rawValue) : scalarValue(rawValue);
            if (StringUtils.hasText(value)) {
                values.put(key, value);
            }
        }
        return values;
    }

    private static String scalarValue(Object value) {
        if (value instanceof CharSequence || value instanceof Number || value instanceof Boolean) {
            return sanitize(value.toString());
        }
        return "";
    }

    private static String avoidValue(Object value) {
        if (value instanceof Collection<?> collection) {
            return collection.stream()
                .map(StylePromptCompiler::scalarValue)
                .filter(StringUtils::hasText)
                .limit(MAX_AVOID_ITEMS)
                .reduce((left, right) -> left + ", " + right)
                .orElse("");
        }
        return scalarValue(value);
    }

    private static String sanitize(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String sanitized = value.replaceAll("[\\r\\n\\t]+", " ")
            .replaceAll("\\s{2,}", " ")
            .trim();
        if (sanitized.length() <= MAX_VALUE_LENGTH) {
            return sanitized;
        }
        return sanitized.substring(0, MAX_VALUE_LENGTH).trim();
    }
}
