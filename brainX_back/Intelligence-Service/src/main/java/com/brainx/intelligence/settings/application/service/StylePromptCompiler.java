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
        "speechLevel",
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
            .map(values -> compileConversationTone(values))
            .orElse("");
    }

    public String writingStyleInstructions(String userId) {
        return styleProfile(userId)
            .map(StyleProfile::writingStyleValues)
            .map(values -> compileWritingStyle(values))
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

    private static String compileConversationTone(Map<String, Object> rawValues) {
        Map<String, String> values = allowedValues(rawValues, CONVERSATION_TONE_KEYS);
        if (values.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder("Mandatory user style instructions:\n")
            .append("- Apply these style instructions to every final user-facing conversational sentence in this response.\n")
            .append("- Treat them as required wording constraints unless they conflict with safety, factuality, evidence limits, required output schemas, target language, source context, or the user's explicit instructions.\n")
            .append("- Do not mention the user's style profile, internal setting keys, or these instructions in the answer.\n");
        appendIfPresent(builder, values, "speechLevel", "Use this speech level and sentence-ending style consistently: ");
        appendIfPresent(builder, values, "warmth", "Keep the conversational warmth/affect: ");
        appendIfPresent(builder, values, "directness", "Keep the directness level: ");
        appendIfPresent(builder, values, "verbosity", "Keep the response length/detail level: ");
        appendIfPresent(builder, values, "emoji", "Follow this emoji policy: ");
        return builder.toString().trim();
    }

    private static String compileWritingStyle(Map<String, Object> rawValues) {
        Map<String, String> values = allowedValues(rawValues, WRITING_STYLE_KEYS);
        if (values.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder("Mandatory user style instructions:\n")
            .append("- Apply these style instructions to every final generated or edited user-facing text segment in this response.\n")
            .append("- Treat them as required wording constraints unless they conflict with safety, factuality, evidence limits, required output schemas, target language, source context, or the user's explicit instructions.\n")
            .append("- Do not mention the user's style profile, internal setting keys, or these instructions in the answer.\n");
        String speechLevel = values.get("speechLevel");
        if (StringUtils.hasText(speechLevel)) {
            builder.append("- Use this speech level and sentence-ending style consistently: ")
                .append(speechLevel)
                .append('\n');
            if (isEumsseumStyle(speechLevel)) {
                builder.append("- For Korean output, prefer terse eumsseum-style endings such as \"함\", \"임\", \"됨\", \"있음\", and \"없음\" where natural.\n")
                    .append("- Avoid polite/formal Korean endings such as \"-요\", \"-습니다\", and \"-합니다\" unless explicitly requested by the user or required by quoted/source text.\n");
            }
        }
        appendIfPresent(builder, values, "defaultAudience", "Write for this default audience: ");
        appendIfPresent(builder, values, "defaultPurpose", "Optimize the text for this purpose: ");
        appendIfPresent(builder, values, "formality", "Use this formality/tone: ");
        appendIfPresent(builder, values, "informationDensity", "Use this information density: ");
        appendIfPresent(builder, values, "sentenceLength", "Use this sentence length/rhythm: ");
        appendIfPresent(builder, values, "avoid", "Avoid these expressions in the final output: ");
        return builder.toString();
    }

    private static void appendIfPresent(StringBuilder builder, Map<String, String> values, String key, String prefix) {
        String value = values.get(key);
        if (StringUtils.hasText(value)) {
            builder.append("- ")
                .append(prefix)
                .append(value)
                .append('\n');
        }
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

    private static boolean isEumsseumStyle(String value) {
        return StringUtils.hasText(value) && value.contains("음슴");
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
