package com.brainx.ingestion.service;

import com.brainx.ingestion.exception.BrainXException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;

/**
 * [ING-01] 단위 테스트: Notion OAuth 토큰 교환 응답 body=null 시 NPE → BrainXException 래핑 버그
 *
 * NotionApiService.java:61-66
 *   Map<String, Object> data = res.getBody();  // null 가능
 *   return new NotionTokenResult(
 *       (String) data.get("access_token"),     // NPE
 *       ...
 *
 * 실제 동작: NPE는 catch (Exception e) 블록에서 잡혀 BrainXException(NOTION_TOKEN_ERROR)으로 변환됨
 * → 근본 원인(NPE)을 숨기므로 여전히 버그임 — null 가드가 필요
 *
 * 수정 방향: data == null 시 명시적 예외 처리 또는 Optional 사용
 */
@ExtendWith(MockitoExtension.class)
class NotionApiServiceTokenNullTest {

    @InjectMocks
    private NotionApiService notionApiService;

    @Mock private RestTemplate restTemplate;
    @Mock private AssetService assetService;
    @Mock private NotionRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(notionApiService, "clientId", "test-client-0000");
        ReflectionTestUtils.setField(notionApiService, "clientSecret", "test-secret-0000");
        ReflectionTestUtils.setField(notionApiService, "tokenUrl", "https://api.notion.com/v1/oauth/token");
    }

    @Test
    @DisplayName("[ING-01] Notion 토큰 교환 응답 body=null → BrainXException(NOTION_TOKEN_ERROR) — NPE 래핑 확인")
    void exchangeToken_whenResponseBodyIsNull_throwsBrainXException() {
        // given — null body 응답
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> nullBodyResponse = new ResponseEntity<>(null, HttpStatus.OK);
        given(restTemplate.postForEntity(anyString(), any(), eq(Map.class)))
                .willReturn(nullBodyResponse);

        // when / then — NPE가 catch (Exception e)에서 잡혀 BrainXException으로 래핑됨
        assertThatThrownBy(() -> notionApiService.exchangeToken("auth-code", "http://localhost/callback"))
                .isInstanceOf(BrainXException.class)
                .satisfies(ex -> assertThat(((BrainXException) ex).getCode())
                        .isEqualTo("NOTION_TOKEN_ERROR"));
        // 수정 후에는 null 가드를 추가하고 더 명확한 오류 메시지를 제공해야 함
    }

    @Test
    @DisplayName("[ING-01] Notion 응답에 access_token 키 누락 시 null accessToken 반환 — 다운스트림 NPE 위험")
    void exchangeToken_whenAccessTokenMissing_returnsNullAccessToken() {
        // given — body는 있지만 access_token 없음
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> response = new ResponseEntity<>(
                Map.of("workspace_id", "ws-123", "workspace_name", "테스트 워크스페이스"),
                HttpStatus.OK
        );
        given(restTemplate.postForEntity(anyString(), any(), eq(Map.class)))
                .willReturn(response);

        // when
        var result = notionApiService.exchangeToken("auth-code", "http://localhost/callback");

        // then — access_token이 null인 상태로 반환 → 사용 시 NPE 유발
        assertThat(result.getAccessToken()).isNull();
        assertThat(result.getWorkspaceId()).isEqualTo("ws-123");
    }

    @Test
    @DisplayName("[ING-01] 정상 Notion 응답 — access_token 정상 추출")
    void exchangeToken_whenValidResponse_returnsToken() {
        // given
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> response = new ResponseEntity<>(
                Map.of(
                        "access_token", "secret_notion_token_abc123",
                        "workspace_id", "ws-456",
                        "workspace_name", "내 워크스페이스"
                ),
                HttpStatus.OK
        );
        given(restTemplate.postForEntity(anyString(), any(), eq(Map.class)))
                .willReturn(response);

        // when
        var result = notionApiService.exchangeToken("auth-code", "http://localhost/callback");

        // then
        assertThat(result.getAccessToken()).isEqualTo("secret_notion_token_abc123");
        assertThat(result.getWorkspaceId()).isEqualTo("ws-456");
    }
}
