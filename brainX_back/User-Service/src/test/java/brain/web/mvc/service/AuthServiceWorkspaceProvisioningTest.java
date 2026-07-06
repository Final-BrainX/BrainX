package brain.web.mvc.service;

import brain.web.mvc.client.WorkspaceServiceClient;
import brain.web.mvc.dto.request.AuthRequests.ConsentRequest;
import brain.web.mvc.dto.request.AuthRequests.EmailSignupRequest;
import brain.web.mvc.dto.request.AuthRequests.OnboardingCompleteRequest;
import brain.web.mvc.dto.response.AuthResponses.AuthTokenResponse;
import brain.web.mvc.entity.OAuthAccount;
import brain.web.mvc.entity.RefreshToken;
import brain.web.mvc.entity.User;
import brain.web.mvc.entity.UserRole;
import brain.web.mvc.repository.ConsentRecordRepository;
import brain.web.mvc.repository.OAuthAccountRepository;
import brain.web.mvc.repository.RefreshTokenRepository;
import brain.web.mvc.repository.UserOnboardingProfileRepository;
import brain.web.mvc.repository.UserRepository;
import brain.web.mvc.security.JwtTokenProvider;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AuthServiceWorkspaceProvisioningTest {

    private static final ConsentRequest CONSENTS = new ConsentRequest(true, true, false, false);

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
    @Mock private HttpServletRequest httpServletRequest;

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

        lenient().when(passwordEncoder.encode(any(String.class))).thenReturn("encoded-password");
        lenient().when(jwtTokenProvider.createAccessToken(any(User.class), any(String.class))).thenReturn("access-token");
        lenient().when(jwtTokenProvider.createRefreshToken(any(User.class), any(String.class))).thenReturn("refresh-token");
        lenient().when(jwtTokenProvider.refreshExpirationMillis()).thenReturn(604800000L);
        lenient().when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(consentRecordRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(oAuthAccountRepository.save(any(OAuthAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(userOnboardingProfileRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void signupCreatesDefaultWorkspaceAfterUserSave() {
        given(userRepository.existsByEmail("brainx@example.com")).willReturn(false);
        given(userRepository.save(any(User.class))).willAnswer(invocation -> savedUser(invocation.getArgument(0), "usr_signup_1"));

        AuthTokenResponse response = authService.signup(
                new EmailSignupRequest("brainx@example.com", "123456", "Abcd1234!", "Abcd1234!", CONSENTS),
                httpServletRequest
        );

        verify(workspaceServiceClient).provisionDefaultWorkspace("usr_signup_1");
        assertThat(response.userId()).isEqualTo("usr_signup_1");
        assertThat(response.accessToken()).isEqualTo("access-token");
        assertThat(response.refreshToken()).isEqualTo("refresh-token");
    }

    @Test
    void completeOnboardingCreatesDefaultWorkspaceAfterUserSave() {
        given(userRepository.existsByEmail("oauth@example.com")).willReturn(false);
        given(userRepository.save(any(User.class))).willAnswer(invocation -> savedUser(invocation.getArgument(0), "usr_oauth_1"));

        putPendingOAuthSignup("onb_token_1", "google", "provider-user-1", "oauth@example.com", "OAuth Nick", "https://img");

        AuthTokenResponse response = authService.completeOnboarding(
                new OnboardingCompleteRequest("onb_token_1", "Final Nick", null, List.of("ai", "notes"), CONSENTS),
                httpServletRequest
        );

        verify(workspaceServiceClient).provisionDefaultWorkspace("usr_oauth_1");
        assertThat(response.userId()).isEqualTo("usr_oauth_1");
        assertThat(response.nickname()).isEqualTo("Final Nick");
    }

    @Test
    void signupContinuesWhenWorkspaceProvisioningFails() {
        given(userRepository.existsByEmail("brainx@example.com")).willReturn(false);
        given(userRepository.save(any(User.class))).willAnswer(invocation -> savedUser(invocation.getArgument(0), "usr_signup_2"));
        doThrow(new RuntimeException("workspace-service down"))
                .when(workspaceServiceClient)
                .provisionDefaultWorkspace("usr_signup_2");

        AuthTokenResponse response = authService.signup(
                new EmailSignupRequest("brainx@example.com", "123456", "Abcd1234!", "Abcd1234!", CONSENTS),
                httpServletRequest
        );

        verify(workspaceServiceClient).provisionDefaultWorkspace("usr_signup_2");
        verify(userLoginSessionService).recordLoginSession(eq("usr_signup_2"), any(String.class), eq(httpServletRequest));
        assertThat(response.userId()).isEqualTo("usr_signup_2");
        assertThat(response.accessToken()).isEqualTo("access-token");
        assertThat(response.refreshToken()).isEqualTo("refresh-token");
    }

    private User savedUser(User original, String userId) {
        return User.builder()
                .userId(userId)
                .email(original.getEmail())
                .password(original.getPassword())
                .nickname(original.getNickname())
                .profileImageUrl(original.getProfileImageUrl())
                .role(original.getRole() == null ? UserRole.ROLE_USER : original.getRole())
                .emailVerified(original.isEmailVerified())
                .twoFactorEnabled(original.isTwoFactorEnabled())
                .build();
    }

    @SuppressWarnings("unchecked")
    private void putPendingOAuthSignup(String token, String provider, String providerUserId, String email, String nickname, String profileImageUrl) {
        try {
            Class<?> oauthProfileClass = Class.forName("brain.web.mvc.service.AuthService$OAuthProfile");
            var oauthProfileConstructor = oauthProfileClass.getDeclaredConstructors()[0];
            oauthProfileConstructor.setAccessible(true);
            Object oauthProfile = oauthProfileConstructor.newInstance(providerUserId, email, nickname, profileImageUrl);
            Class<?> pendingClass = Class.forName("brain.web.mvc.service.AuthService$PendingOAuthSignup");
            var pendingConstructor = pendingClass.getDeclaredConstructors()[0];
            pendingConstructor.setAccessible(true);
            Object pending = pendingConstructor.newInstance(provider, oauthProfile);
            Map<String, Object> pendingMap = (Map<String, Object>) ReflectionTestUtils.getField(authService, "pendingOAuthSignups");
            assertThat(pendingMap).isNotNull();
            pendingMap.put(token, pending);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Failed to seed pending OAuth signup for test.", exception);
        }
    }
}
