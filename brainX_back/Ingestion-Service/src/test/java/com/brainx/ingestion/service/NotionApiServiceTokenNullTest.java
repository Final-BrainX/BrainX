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
 * [ING-01] 단위 테스트: Notion OAuth 토큰 교환 응답 body=null 또는 access_token 누락 시 처리 확인
 *
 * NotionApiService.exchangeToken 수정 후 동작:
 *   응답 바디가 null이거나 access_token이 없으면 명시적으로 BrainXException(NOTION_TOKEN_ERROR)을 던진다.
 *   (수정 전에는 NPE가 catch(Exception e)에서 잡혀 같은 예외로 변환되긴 했지만, 예외 클래스명·메시지가
 *   그대로 노출되고 null 가드가 없었다.)
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
    @DisplayName("[ING-01] Notion 토큰 교환 응답 body=null → BrainXException(NOTION_TOKEN_ERROR)")
    void exchangeToken_whenResponseBodyIsNull_throwsBrainXException() {
        // given — null body 응답
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> nullBodyResponse = new ResponseEntity<>(null, HttpStatus.OK);
        given(restTemplate.postForEntity(anyString(), any(), eq(Map.class)))
                .willReturn(nullBodyResponse);

        // when / then — 명시적 null 가드에서 BrainXException(NOTION_TOKEN_ERROR)을 던짐
        assertThatThrownBy(() -> notionApiService.exchangeToken("auth-code", "http://localhost/callback"))
                .isInstanceOf(BrainXException.class)
                .satisfies(ex -> assertThat(((BrainXException) ex).getErrorCode())
                        .isEqualTo("NOTION_TOKEN_ERROR"));
    }

    @Test
    @DisplayName("[ING-01] Notion 응답에 access_token 키 누락 시 BrainXException(NOTION_TOKEN_ERROR)")
    void exchangeToken_whenAccessTokenMissing_throwsBrainXException() {
        // given — body는 있지만 access_token 없음
        @SuppressWarnings("unchecked")
        ResponseEntity<Map> response = new ResponseEntity<>(
                Map.of("workspace_id", "ws-123", "workspace_name", "테스트 워크스페이스"),
                HttpStatus.OK
        );
        given(restTemplate.postForEntity(anyString(), any(), eq(Map.class)))
                .willReturn(response);

        // when / then — access_token이 없으면 null accessToken을 반환하는 대신 명시적으로 예외를 던짐
        assertThatThrownBy(() -> notionApiService.exchangeToken("auth-code", "http://localhost/callback"))
                .isInstanceOf(BrainXException.class)
                .satisfies(ex -> assertThat(((BrainXException) ex).getErrorCode())
                        .isEqualTo("NOTION_TOKEN_ERROR"));
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
