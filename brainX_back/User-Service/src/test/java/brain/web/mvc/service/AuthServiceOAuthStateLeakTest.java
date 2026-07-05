package brain.web.mvc.service;

import brain.web.mvc.client.WorkspaceServiceClient;
import brain.web.mvc.repository.*;
import brain.web.mvc.security.JwtTokenProvider;
import brain.web.mvc.service.EmailVerificationService;
import brain.web.mvc.service.UserLoginSessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/**
 * [USER-01] 단위 테스트: OAuth 상태 맵 TTL 없음 — 메모리 무한 누적 버그 재현
 *
 * AuthService.java:72-73
 *   private final Map<String, String> oauthStates = new ConcurrentHashMap<>();
 *   → TTL 없이 항목이 누적되어 OOM 위험
 *
 * 재현 조건: authorizeOAuth() 반복 호출 후 completeOAuth() 미호출 시 맵 크기 증가
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceOAuthStateLeakTest {

    private AuthService authService;

    @Mock private UserRepository userRepository;
    @Mock private ConsentRecordRepository consentRecordRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private OAuthAccountRepository oAuthAccountRepository;
    @Mock private UserOnboardingProfileRepository userOnboardingProfileRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtTokenProvider jwtTokenProvider;
    @Mock private EmailVerificationService emailVerificationService;
    @Mock private UserLoginSessionService userLoginSessionService;
    @Mock private RestClient.Builder restClientBuilder;
    @Mock private WorkspaceServiceClient workspaceServiceClient;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepository,
                consentRecordRepository,
                refreshTokenRepository,
                oAuthAccountRepository,
                userOnboardingProfileRepository,
                passwordEncoder,
                jwtTokenProvider,
                emailVerificationService,
                userLoginSessionService,
                restClientBuilder,
                workspaceServiceClient
        );

        // Google OAuth 최소 설정 (빈 값이면 ApiException 발생)
        ReflectionTestUtils.setField(authService, "googleClientId", "test-google-client-id");
        ReflectionTestUtils.setField(authService, "googleClientSecret", "test-google-secret");
        ReflectionTestUtils.setField(authService, "googleRedirectUri", "http://localhost:3000/callback");
        ReflectionTestUtils.setField(authService, "googleScope", "openid email profile");
        ReflectionTestUtils.setField(authService, "googleAuthorizationUri", "https://accounts.google.com/o/oauth2/v2/auth");
        ReflectionTestUtils.setField(authService, "googleTokenUri", "https://oauth2.googleapis.com/token");
        ReflectionTestUtils.setField(authService, "googleUserInfoUri", "https://www.googleapis.com/oauth2/v3/userinfo");
    }

    @Test
    @DisplayName("[USER-01] authorizeOAuth 반복 호출 후 completeOAuth 미호출 시 oauthStates 맵 무한 누적 — 버그 재현")
    void authorizeOAuth_repeatedCalls_statesAccumulateWithoutTTL() {
        // when — OAuth 시작만 1000회 반복 (완료하지 않음)
        for (int i = 0; i < 1000; i++) {
            authService.authorizeOAuth("google");
        }

        // then — oauthStates 맵에 1000개 항목이 TTL 없이 그대로 남음
        @SuppressWarnings("unchecked")
        Map<String, String> oauthStates = (Map<String, String>)
                ReflectionTestUtils.getField(authService, "oauthStates");

        assertThat(oauthStates).isNotNull();
        assertThat(oauthStates).hasSize(1000);
        // TTL이 없으므로 서버 재시작 없이는 절대 제거되지 않음
        // 장기 운영 시 OOM으로 이어질 수 있음
    }

    @Test
    @DisplayName("[USER-01] 만료되어야 할 state가 유효하게 남아 있어 오래된 state 재사용 가능 — 보안 결함")
    void authorizeOAuth_expiredStateShouldBeInvalid_butRemainsInMap() {
        // given — OAuth 시작
        var response = authService.authorizeOAuth("google");
        String state = response.state();

        @SuppressWarnings("unchecked")
        Map<String, String> oauthStates = (Map<String, String>)
                ReflectionTestUtils.getField(authService, "oauthStates");

        // when — 오랜 시간이 지난 후에도 (TTL 없으므로) state가 맵에 남아있음
        assertThat(oauthStates).containsKey(state);

        // then — 10분, 1시간이 지나도 state는 유효하게 남아 있음
        // 수정 방향: Guava Cache.expireAfterWrite(10, TimeUnit.MINUTES) 또는 Redis TTL 사용
        assertThat(oauthStates.get(state)).isEqualTo("google");
    }
}
