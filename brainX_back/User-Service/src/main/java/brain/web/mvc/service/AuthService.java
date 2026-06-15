package brain.web.mvc.service;

import brain.web.mvc.dto.request.AuthRequests.ConsentRequest;
import brain.web.mvc.dto.request.AuthRequests.EmailSignupRequest;
import brain.web.mvc.dto.request.AuthRequests.LoginRequest;
import brain.web.mvc.dto.request.AuthRequests.OnboardingCompleteRequest;
import brain.web.mvc.dto.response.AuthResponses.AuthTokenResponse;
import brain.web.mvc.dto.response.AuthResponses.OAuthAuthorizeResponse;
import brain.web.mvc.dto.response.AuthResponses.OAuthCallbackResponse;
import brain.web.mvc.dto.response.AuthResponses.TokenRefreshResponse;
import brain.web.mvc.entity.ConsentRecord;
import brain.web.mvc.entity.OAuthAccount;
import brain.web.mvc.entity.RefreshToken;
import brain.web.mvc.entity.User;
import brain.web.mvc.entity.UserOnboardingProfile;
import brain.web.mvc.entity.UserRole;
import brain.web.mvc.exception.ApiException;
import brain.web.mvc.repository.ConsentRecordRepository;
import brain.web.mvc.repository.OAuthAccountRepository;
import brain.web.mvc.repository.RefreshTokenRepository;
import brain.web.mvc.repository.UserOnboardingProfileRepository;
import brain.web.mvc.repository.UserRepository;
import brain.web.mvc.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.DigestUtils;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class AuthService {
    private static final Pattern PASSWORD_PATTERN =
            Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$");
    private static final Set<String> OAUTH_PROVIDERS = Set.of("kakao", "google", "apple", "naver");

    private final UserRepository userRepository;
    private final ConsentRecordRepository consentRecordRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final OAuthAccountRepository oAuthAccountRepository;
    private final UserOnboardingProfileRepository userOnboardingProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailVerificationService emailVerificationService;
    private final RestClient.Builder restClientBuilder;

    private final Map<String, String> oauthStates = new ConcurrentHashMap<>();
    private final Map<String, PendingOAuthSignup> pendingOAuthSignups = new ConcurrentHashMap<>();

    @Value("${brainx.oauth.google.client-id:}")
    private String googleClientId;
    @Value("${brainx.oauth.google.client-secret:}")
    private String googleClientSecret;
    @Value("${brainx.oauth.google.redirect-uri:}")
    private String googleRedirectUri;
    @Value("${brainx.oauth.google.scope:}")
    private String googleScope;
    @Value("${brainx.oauth.google.authorization-uri:}")
    private String googleAuthorizationUri;
    @Value("${brainx.oauth.google.token-uri:}")
    private String googleTokenUri;
    @Value("${brainx.oauth.google.user-info-uri:}")
    private String googleUserInfoUri;

    @Value("${brainx.oauth.kakao.client-id:}")
    private String kakaoClientId;
    @Value("${brainx.oauth.kakao.client-secret:}")
    private String kakaoClientSecret;
    @Value("${brainx.oauth.kakao.redirect-uri:}")
    private String kakaoRedirectUri;
    @Value("${brainx.oauth.kakao.scope:}")
    private String kakaoScope;
    @Value("${brainx.oauth.kakao.authorization-uri:}")
    private String kakaoAuthorizationUri;
    @Value("${brainx.oauth.kakao.token-uri:}")
    private String kakaoTokenUri;
    @Value("${brainx.oauth.kakao.user-info-uri:}")
    private String kakaoUserInfoUri;

    @Value("${brainx.oauth.naver.client-id:}")
    private String naverClientId;
    @Value("${brainx.oauth.naver.client-secret:}")
    private String naverClientSecret;
    @Value("${brainx.oauth.naver.redirect-uri:}")
    private String naverRedirectUri;
    @Value("${brainx.oauth.naver.scope:}")
    private String naverScope;
    @Value("${brainx.oauth.naver.authorization-uri:}")
    private String naverAuthorizationUri;
    @Value("${brainx.oauth.naver.token-uri:}")
    private String naverTokenUri;
    @Value("${brainx.oauth.naver.user-info-uri:}")
    private String naverUserInfoUri;

    @Value("${brainx.oauth.apple.client-id:}")
    private String appleClientId;
    @Value("${brainx.oauth.apple.client-secret:}")
    private String appleClientSecret;
    @Value("${brainx.oauth.apple.redirect-uri:}")
    private String appleRedirectUri;
    @Value("${brainx.oauth.apple.scope:}")
    private String appleScope;
    @Value("${brainx.oauth.apple.authorization-uri:}")
    private String appleAuthorizationUri;
    @Value("${brainx.oauth.apple.token-uri:}")
    private String appleTokenUri;
    @Value("${brainx.oauth.apple.user-info-uri:}")
    private String appleUserInfoUri;

    @Transactional
    public AuthTokenResponse signup(EmailSignupRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "이미 가입된 이메일입니다.");
        }
        if (!request.password().equals(request.passwordConfirm())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "비밀번호 확인이 일치하지 않습니다.");
        }
        validatePassword(request.password());

        emailVerificationService.verifySignupCode(email, request.verificationCode());

        User user = userRepository.save(User.builder()
                .email(email)
                .password(passwordEncoder.encode(request.password()))
                .nickname(defaultNickname(email))
                .role(UserRole.ROLE_USER)
                .emailVerified(true)
                .twoFactorEnabled(false)
                .build());

        saveConsents(user, request.consents());
        return issueAuthTokenResponse(user, "ONBOARDING");
    }

    @Transactional
    public AuthTokenResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "존재하지 않는 이메일입니다."));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "비밀번호가 올바르지 않습니다.");
        }

        if (user.isTwoFactorEnabled()) {
            return AuthTokenResponse.builder()
                    .accessToken(null)
                    .refreshToken(null)
                    .tokenType("Bearer")
                    .requires2fa(true)
                    .build();
        }

        return issueAuthTokenResponse(user, null);
    }

    @Transactional
    public void logout(String refreshToken) {
        RefreshToken token = refreshTokenRepository.findByToken(refreshToken)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Refresh Token이 올바르지 않습니다."));
        token.revoke();
    }

    @Transactional
    public TokenRefreshResponse refresh(String refreshToken) {
        RefreshToken storedToken = refreshTokenRepository.findByToken(refreshToken)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Refresh Token이 만료되었습니다."));

        if (!storedToken.isUsable() || !jwtTokenProvider.isValid(refreshToken)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh Token이 만료되었습니다.");
        }

        storedToken.revoke();
        RefreshToken nextRefreshToken = saveRefreshToken(storedToken.getUser(), jwtTokenProvider.createRefreshToken(storedToken.getUser()));
        return TokenRefreshResponse.builder()
                .accessToken(jwtTokenProvider.createAccessToken(storedToken.getUser()))
                .refreshToken(nextRefreshToken.getToken())
                .tokenType("Bearer")
                .build();
    }

    public OAuthAuthorizeResponse authorizeOAuth(String rawProvider) {
        String provider = normalizeProvider(rawProvider);
        OAuthConfig config = oauthConfig(provider);
        if (!StringUtils.hasText(config.clientId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 제공자 설정이 필요합니다.");
        }

        String state = "st_" + UUID.randomUUID().toString().replace("-", "");
        oauthStates.put(state, provider);

        String authorizationUrl = UriComponentsBuilder.fromUriString(config.authorizationUri())
                .queryParam("client_id", config.clientId())
                .queryParam("redirect_uri", config.redirectUri())
                .queryParam("response_type", "code")
                .queryParam("scope", config.scope())
                .queryParam("state", state)
                .build()
                .encode(StandardCharsets.UTF_8)
                .toUriString();

        return OAuthAuthorizeResponse.builder()
                .provider(provider)
                .authorizationUrl(authorizationUrl)
                .state(state)
                .build();
    }

    @Transactional
    public OAuthCallbackResponse completeOAuth(String rawProvider, String code, String state) {
        String provider = normalizeProvider(rawProvider);
        String stateProvider = oauthStates.remove(state);
        if (!provider.equals(stateProvider)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }

        OAuthProfile profile = fetchOAuthProfile(provider, oauthConfig(provider), code);
        OAuthAccount account = oAuthAccountRepository
                .findByProviderAndProviderUserId(provider, profile.providerUserId())
                .orElse(null);

        if (account != null) {
            AuthTokenResponse token = issueAuthTokenResponse(account.getUser(), null);
            return OAuthCallbackResponse.builder()
                    .userId(account.getUser().getUserId())
                    .email(account.getUser().getEmail())
                    .nickname(account.getUser().getNickname())
                    .profileImageUrl(account.getUser().getProfileImageUrl())
                    .accessToken(token.accessToken())
                    .refreshToken(token.refreshToken())
                    .tokenType(token.tokenType())
                    .accountLinked(true)
                    .isNewUser(false)
                    .next(null)
                    .build();
        }

        if (userRepository.existsByEmail(profile.email())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "이미 가입된 이메일입니다.");
        }

        String onboardingToken = "onb_" + UUID.randomUUID().toString().replace("-", "");
        pendingOAuthSignups.put(onboardingToken, new PendingOAuthSignup(provider, profile));

        return OAuthCallbackResponse.builder()
                .userId(null)
                .email(profile.email())
                .nickname(profile.nickname())
                .profileImageUrl(profile.profileImageUrl())
                .accessToken(null)
                .refreshToken(null)
                .tokenType("Bearer")
                .onboardingToken(onboardingToken)
                .accountLinked(false)
                .isNewUser(true)
                .next("ONBOARDING")
                .build();
    }

    @Transactional
    public AuthTokenResponse completeOnboarding(OnboardingCompleteRequest request) {
        PendingOAuthSignup pending = pendingOAuthSignups.remove(request.onboardingToken());
        if (pending == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "온보딩 정보가 만료되었습니다. 소셜 로그인을 다시 시도해 주세요.");
        }
        OAuthProfile profile = pending.profile();
        if (userRepository.existsByEmail(profile.email())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "이미 가입된 이메일입니다.");
        }

        String nickname = request.nickname().trim();
        String profileImageUrl = StringUtils.hasText(request.profileImageUrl())
                ? request.profileImageUrl().trim()
                : profile.profileImageUrl();

        User user = userRepository.save(User.builder()
                .email(profile.email())
                .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                .nickname(nickname)
                .profileImageUrl(profileImageUrl)
                .role(UserRole.ROLE_USER)
                .emailVerified(true)
                .twoFactorEnabled(false)
                .build());

        consentRecordRepository.save(ConsentRecord.builder()
                .user(user)
                .termsRequired(true)
                .privacyRequired(true)
                .marketingOptional(false)
                .behaviorAnalyticsOptional(false)
                .build());

        oAuthAccountRepository.save(OAuthAccount.builder()
                .user(user)
                .provider(pending.provider())
                .providerUserId(profile.providerUserId())
                .build());

        userOnboardingProfileRepository.save(UserOnboardingProfile.builder()
                .user(user)
                .interests(request.interests() == null ? List.of() : request.interests())
                .build());

        return issueAuthTokenResponse(user, null);
    }

    private AuthTokenResponse issueAuthTokenResponse(User user, String next) {
        String accessToken = jwtTokenProvider.createAccessToken(user);
        RefreshToken refreshToken = saveRefreshToken(user, jwtTokenProvider.createRefreshToken(user));
        return AuthTokenResponse.builder()
                .userId(user.getUserId())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .profileImageUrl(user.getProfileImageUrl())
                .role(user.getRole().name())
                .accessToken(accessToken)
                .refreshToken(refreshToken.getToken())
                .tokenType("Bearer")
                .requires2fa(false)
                .next(next)
                .build();
    }

    private RefreshToken saveRefreshToken(User user, String token) {
        return refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .token(token)
                .expiresAt(LocalDateTime.now().plusNanos(jwtTokenProvider.refreshExpirationMillis() * 1_000_000))
                .revoked(false)
                .build());
    }

    private void saveConsents(User user, ConsentRequest consents) {
        consentRecordRepository.save(ConsentRecord.builder()
                .user(user)
                .termsRequired(consents.termsRequired())
                .privacyRequired(consents.privacyRequired())
                .marketingOptional(consents.marketingOptional())
                .behaviorAnalyticsOptional(consents.behaviorAnalyticsOptional())
                .build());
    }

    private void validatePassword(String password) {
        if (!PASSWORD_PATTERN.matcher(password).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "비밀번호는 영문, 숫자, 특수문자를 포함해 8자 이상이어야 합니다.");
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeProvider(String provider) {
        String normalized = provider.toLowerCase(Locale.ROOT);
        if (!OAUTH_PROVIDERS.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "지원하지 않는 소셜 로그인 제공자입니다.");
        }
        return normalized;
    }

    private String defaultNickname(String email) {
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : "BrainX 사용자";
    }

    private OAuthConfig oauthConfig(String provider) {
        return switch (provider) {
            case "google" -> new OAuthConfig(googleClientId, googleClientSecret, googleRedirectUri, googleScope, googleAuthorizationUri, googleTokenUri, googleUserInfoUri);
            case "kakao" -> new OAuthConfig(kakaoClientId, kakaoClientSecret, kakaoRedirectUri, kakaoScope, kakaoAuthorizationUri, kakaoTokenUri, kakaoUserInfoUri);
            case "naver" -> new OAuthConfig(naverClientId, naverClientSecret, naverRedirectUri, naverScope, naverAuthorizationUri, naverTokenUri, naverUserInfoUri);
            case "apple" -> new OAuthConfig(appleClientId, appleClientSecret, appleRedirectUri, appleScope, appleAuthorizationUri, appleTokenUri, appleUserInfoUri);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "지원하지 않는 소셜 로그인 제공자입니다.");
        };
    }

    @SuppressWarnings("unchecked")
    private OAuthProfile fetchOAuthProfile(String provider, OAuthConfig config, String code) {
        if (!StringUtils.hasText(config.tokenUri())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 제공자 설정이 필요합니다.");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", config.clientId());
        form.add("redirect_uri", config.redirectUri());
        form.add("code", code);
        if (StringUtils.hasText(config.clientSecret())) {
            form.add("client_secret", config.clientSecret());
        }

        Map<String, Object> tokenResponse;
        try {
            tokenResponse = restClientBuilder.build()
                    .post()
                    .uri(config.tokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }

        String accessToken = tokenResponse == null ? null : (String) tokenResponse.get("access_token");
        if ("apple".equals(provider)) {
            return appleProfile(tokenResponse);
        }
        if (!StringUtils.hasText(accessToken) || !StringUtils.hasText(config.userInfoUri())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }

        Map<String, Object> userInfo;
        try {
            userInfo = restClientBuilder.build()
                    .get()
                    .uri(config.userInfoUri())
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .body(Map.class);
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }

        return switch (provider) {
            case "google" -> googleProfile(userInfo);
            case "kakao" -> kakaoProfile(userInfo);
            case "naver" -> naverProfile(userInfo);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "지원하지 않는 소셜 로그인 제공자입니다.");
        };
    }

    private OAuthProfile googleProfile(Map<String, Object> userInfo) {
        return profile(
                "google",
                stringValue(userInfo, "sub"),
                stringValue(userInfo, "email"),
                stringValue(userInfo, "name"),
                stringValue(userInfo, "picture")
        );
    }

    @SuppressWarnings("unchecked")
    private OAuthProfile kakaoProfile(Map<String, Object> userInfo) {
        String id = String.valueOf(userInfo.get("id"));
        Map<String, Object> account = (Map<String, Object>) userInfo.getOrDefault("kakao_account", Map.of());
        Map<String, Object> profile = (Map<String, Object>) account.getOrDefault("profile", Map.of());
        return profile(
                "kakao",
                id,
                stringValue(account, "email"),
                stringValue(profile, "nickname"),
                stringValue(profile, "profile_image_url")
        );
    }

    @SuppressWarnings("unchecked")
    private OAuthProfile naverProfile(Map<String, Object> userInfo) {
        Map<String, Object> response = (Map<String, Object>) userInfo.getOrDefault("response", Map.of());
        String nickname = StringUtils.hasText(stringValue(response, "nickname"))
                ? stringValue(response, "nickname")
                : stringValue(response, "name");
        return profile(
                "naver",
                stringValue(response, "id"),
                stringValue(response, "email"),
                nickname,
                stringValue(response, "profile_image")
        );
    }

    private OAuthProfile appleProfile(Map<String, Object> tokenResponse) {
        if (tokenResponse == null || !StringUtils.hasText((String) tokenResponse.get("id_token"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }
        Map<String, Object> claims = decodeJwtPayload((String) tokenResponse.get("id_token"));
        return profile("apple", stringValue(claims, "sub"), stringValue(claims, "email"), "Apple 사용자", "");
    }

    private OAuthProfile profile(String provider, String id, String email, String nickname, String profileImageUrl) {
        String fallbackId = StringUtils.hasText(id)
                ? id
                : DigestUtils.md5DigestAsHex((provider + ":" + email).getBytes(StandardCharsets.UTF_8));
        String fallbackEmail = StringUtils.hasText(email)
                ? email.toLowerCase(Locale.ROOT)
                : fallbackId + "@" + provider + ".oauth.brainx";
        String fallbackNickname = StringUtils.hasText(nickname) ? nickname : provider + " 사용자";
        String imageUrl = StringUtils.hasText(profileImageUrl) ? profileImageUrl : null;
        return new OAuthProfile(fallbackId, fallbackEmail, fallbackNickname, imageUrl);
    }

    private String stringValue(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> decodeJwtPayload(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) {
                throw new IllegalArgumentException("Invalid id token");
            }
            byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
            return new com.fasterxml.jackson.databind.ObjectMapper().readValue(payload, Map.class);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "소셜 로그인 인증에 실패했습니다.");
        }
    }

    private record OAuthConfig(
            String clientId,
            String clientSecret,
            String redirectUri,
            String scope,
            String authorizationUri,
            String tokenUri,
            String userInfoUri
    ) {
    }

    private record OAuthProfile(String providerUserId, String email, String nickname, String profileImageUrl) {
    }

    private record PendingOAuthSignup(String provider, OAuthProfile profile) {
    }
}
