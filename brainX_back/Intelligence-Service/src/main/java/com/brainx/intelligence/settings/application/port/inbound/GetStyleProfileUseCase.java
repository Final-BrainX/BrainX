package com.brainx.intelligence.settings.application.port.inbound;

import java.time.Instant;
import java.util.Map;

/**
 * 사용자 문체 프로필을 조회합니다.
 */
public interface GetStyleProfileUseCase {

    StyleProfileResult getStyleProfile(GetStyleProfileQuery query);

    record GetStyleProfileQuery(
        String userId
    ) {
    }

    record StyleProfileResult(
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle,
        Instant detectedFromNotesAt
    ) {
    }
}
