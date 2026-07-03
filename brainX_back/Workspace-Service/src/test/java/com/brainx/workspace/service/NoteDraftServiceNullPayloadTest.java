package com.brainx.workspace.service;

import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

/**
 * [WS-03] 단위 테스트: Draft Redis payload 필드 null 시 NPE 버그 재현
 *
 * NoteDraftService.java:89-90
 *   ((Number) payload.get("baseVersion")).intValue()  // null → NPE
 *   Instant.parse((String) payload.get("clientSavedAt"))  // null → NPE
 */
@ExtendWith(MockitoExtension.class)
class NoteDraftServiceNullPayloadTest {

    private NoteDraftService noteDraftService;

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private ObjectMapper objectMapper;
    @Mock private ValueOperations<String, String> valueOps;

    private final Actor testActor = new Actor(ActorType.USER, "user-test-001");

    @BeforeEach
    void setUp() {
        noteDraftService = new NoteDraftService(redisTemplate, objectMapper);
        ReflectionTestUtils.setField(noteDraftService, "draftTtlSeconds", 86400L);
        given(redisTemplate.opsForValue()).willReturn(valueOps);
    }

    @Test
    @DisplayName("[WS-03] baseVersion 필드 없는 Redis payload 조회 시 NullPointerException 발생 — 버그 재현")
    void getDraft_whenBaseVersionMissing_throwsNPE() throws JsonProcessingException {
        // given — baseVersion 키가 없는 JSON payload
        String rawPayload = """
                {
                  "noteId": "note-1",
                  "actorType": "user",
                  "title": "테스트 노트",
                  "markdown": "내용",
                  "savedAt": "2026-07-01T00:00:00Z",
                  "clientSavedAt": "2026-07-01T00:00:00Z"
                }
                """;
        given(valueOps.get(anyString())).willReturn(rawPayload);
        given(redisTemplate.getExpire(anyString())).willReturn(-1L);

        java.util.Map<String, Object> payloadMap = new java.util.HashMap<>();
        payloadMap.put("noteId", "note-1");
        payloadMap.put("actorType", "user");
        payloadMap.put("title", "테스트 노트");
        payloadMap.put("markdown", "내용");
        payloadMap.put("savedAt", "2026-07-01T00:00:00Z");
        payloadMap.put("clientSavedAt", "2026-07-01T00:00:00Z");
        // baseVersion 없음
        given(objectMapper.readValue(anyString(),
                org.mockito.ArgumentMatchers.<com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>>any()))
                .willReturn(payloadMap);

        // when / then — NoteDraftService.java:89에서 NPE 발생
        assertThatThrownBy(() -> noteDraftService.getDraft(testActor, "note-1"))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    @DisplayName("[WS-03] clientSavedAt 필드 없는 Redis payload 조회 시 NullPointerException 발생 — 버그 재현")
    void getDraft_whenClientSavedAtMissing_throwsNPE() throws JsonProcessingException {
        // given — clientSavedAt 키가 없는 payload
        String rawPayload = "{}";
        given(valueOps.get(anyString())).willReturn(rawPayload);
        given(redisTemplate.getExpire(anyString())).willReturn(-1L);

        java.util.Map<String, Object> payloadMap = new java.util.HashMap<>();
        payloadMap.put("noteId", "note-1");
        payloadMap.put("actorType", "user");
        payloadMap.put("title", "테스트 노트");
        payloadMap.put("markdown", "내용");
        payloadMap.put("savedAt", "2026-07-01T00:00:00Z");
        payloadMap.put("baseVersion", 1);
        // clientSavedAt 없음
        given(objectMapper.readValue(anyString(),
                org.mockito.ArgumentMatchers.<com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>>any()))
                .willReturn(payloadMap);

        // when / then — NoteDraftService.java:90에서 NPE 발생
        assertThatThrownBy(() -> noteDraftService.getDraft(testActor, "note-1"))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    @DisplayName("[WS-03] Redis에 저장된 draft가 없으면 null 반환 — 정상 케이스")
    void getDraft_whenKeyNotFound_returnsNull() {
        // given
        given(valueOps.get(anyString())).willReturn(null);

        // when
        var result = noteDraftService.getDraft(testActor, "note-not-exists");

        // then
        org.assertj.core.api.Assertions.assertThat(result).isNull();
    }
}
