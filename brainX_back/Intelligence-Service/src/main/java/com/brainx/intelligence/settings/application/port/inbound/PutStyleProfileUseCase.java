package com.brainx.intelligence.settings.application.port.inbound;

import java.time.Instant;
import java.util.Map;

/**
 * 사용자 문체 프로필을 설정합니다.
 */
public interface PutStyleProfileUseCase {

    StyleProfileResult putStyleProfile(PutStyleProfileCommand command);

    record PutStyleProfileCommand(
        String userId,
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle
    ) {
    }

    record StyleProfileResult(
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle,
        Instant detectedFromNotesAt
    ) {
    }
}
