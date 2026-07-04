package com.brainx.intelligence.settings.domain;

import java.time.Instant;
import java.util.Map;

/**
 * 사용자 문체 프로필입니다.
 */
public record StyleProfile(
    String userId,
    ConversationTone conversationTone,
    WritingStyle writingStyle,
    Instant detectedFromNotesAt
) {

    public StyleProfile {
        userId = SettingsValidation.requireText(userId, "userId");
        conversationTone = conversationTone == null ? ConversationTone.empty() : conversationTone;
        writingStyle = writingStyle == null ? WritingStyle.empty() : writingStyle;
    }

    public static StyleProfile empty(String userId) {
        return new StyleProfile(userId, ConversationTone.empty(), WritingStyle.empty(), null);
    }

    public Map<String, Object> conversationToneValues() {
        return conversationTone.values();
    }

    public Map<String, Object> writingStyleValues() {
        return writingStyle.values();
    }
}
