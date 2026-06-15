package brain.web.mvc.service;

import brain.web.mvc.dto.request.UserRequests.ChangePasswordRequest;
import brain.web.mvc.dto.request.UserRequests.DeletionRequest;
import brain.web.mvc.dto.request.UserRequests.EmailTwoFactorRequest;
import brain.web.mvc.dto.request.UserRequests.LinkSocialAccountRequest;
import brain.web.mvc.dto.request.UserRequests.UpdateConsentRequest;
import brain.web.mvc.dto.request.UserRequests.UpdateProfileRequest;
import brain.web.mvc.dto.response.UserResponses.ConsentInfo;
import brain.web.mvc.dto.response.UserResponses.ConsentUpdateResponse;
import brain.web.mvc.dto.response.UserResponses.DeletionResponse;
import brain.web.mvc.dto.response.UserResponses.MyProfileResponse;
import brain.web.mvc.dto.response.UserResponses.ProfileUpdateResponse;
import brain.web.mvc.dto.response.UserResponses.SecurityInfo;
import brain.web.mvc.dto.response.UserResponses.SocialAccountResponse;
import brain.web.mvc.dto.response.UserResponses.TwoFactorResponse;
import brain.web.mvc.entity.ConsentRecord;
import brain.web.mvc.entity.OAuthAccount;
import brain.web.mvc.entity.User;
import brain.web.mvc.exception.ApiException;
import brain.web.mvc.repository.ConsentRecordRepository;
import brain.web.mvc.repository.OAuthAccountRepository;
import brain.web.mvc.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class UserService {
    private static final Pattern PASSWORD_PATTERN =
            Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$");

    private final UserRepository userRepository;
    private final ConsentRecordRepository consentRecordRepository;
    private final OAuthAccountRepository oAuthAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthService authService;

    @Transactional(readOnly = true)
    public MyProfileResponse getMyProfile(String userId) {
        User user = getUser(userId);
        ConsentRecord consent = consentRecordRepository.findById(userId).orElse(null);
        List<String> linkedProviders = oAuthAccountRepository.findByUserUserId(userId)
                .stream()
                .map(OAuthAccount::getProvider)
                .toList();

        return MyProfileResponse.builder()
                .userId(user.getUserId())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .profileImageUrl(user.getProfileImageUrl())
                .role(user.getRole().name())
                .security(SecurityInfo.builder()
                        .twoFactorEnabled(user.isTwoFactorEnabled())
                        .linkedProviders(linkedProviders)
                        .build())
                .consents(toConsentInfo(consent))
                .build();
    }

    @Transactional
    public ProfileUpdateResponse updateProfile(String userId, UpdateProfileRequest request) {
        User user = getUser(userId);
        String nickname = StringUtils.hasText(request.nickname()) ? request.nickname().trim() : user.getNickname();
        if (nickname.length() < 2 || nickname.length() > 20) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "닉네임은 2자 이상 20자 이하로 입력해주세요.");
        }

        String profileImageUrl = StringUtils.hasText(request.profileImageAssetId())
                ? request.profileImageAssetId().trim()
                : user.getProfileImageUrl();
        user.updateProfile(nickname, profileImageUrl);

        return ProfileUpdateResponse.builder()
                .userId(user.getUserId())
                .nickname(user.getNickname())
                .profileImageUrl(user.getProfileImageUrl())
                .build();
    }

    @Transactional
    public void changePassword(String userId, ChangePasswordRequest request) {
        User user = getUser(userId);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPassword())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다.");
        }
        if (!request.newPassword().equals(request.newPasswordConfirm())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "새 비밀번호 확인이 일치하지 않습니다.");
        }
        if (!PASSWORD_PATTERN.matcher(request.newPassword()).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "비밀번호는 영문, 숫자, 특수문자를 포함해 8자 이상이어야 합니다.");
        }
        user.changePassword(passwordEncoder.encode(request.newPassword()));
    }

    @Transactional
    public TwoFactorResponse configureEmailTwoFactor(String userId, EmailTwoFactorRequest request) {
        User user = getUser(userId);
        user.configureTwoFactor(Boolean.TRUE.equals(request.enabled()));
        return TwoFactorResponse.builder()
                .verificationId("vrf_" + UUID.randomUUID().toString().replace("-", ""))
                .build();
    }

    @Transactional
    public SocialAccountResponse linkSocialAccount(String userId, LinkSocialAccountRequest request) {
        User user = getUser(userId);
        AuthService.OAuthAccountInfo accountInfo = authService.resolveOAuthAccount(request.provider(), request.oauthCode());
        oAuthAccountRepository.findByProviderAndProviderUserId(accountInfo.provider(), accountInfo.providerUserId())
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "이미 연결된 소셜 계정입니다.");
                });

        oAuthAccountRepository.save(OAuthAccount.builder()
                .user(user)
                .provider(accountInfo.provider())
                .providerUserId(accountInfo.providerUserId())
                .build());

        return SocialAccountResponse.builder()
                .provider(accountInfo.provider())
                .linked(true)
                .build();
    }

    @Transactional
    public SocialAccountResponse unlinkSocialAccount(String userId, String provider) {
        OAuthAccount account = oAuthAccountRepository.findByUserUserIdAndProvider(userId, provider)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "연결된 소셜 계정이 없습니다."));
        oAuthAccountRepository.delete(account);
        return SocialAccountResponse.builder()
                .provider(provider)
                .linked(false)
                .build();
    }

    @Transactional
    public ConsentUpdateResponse updateConsents(String userId, UpdateConsentRequest request) {
        if (!request.termsRequired() || !request.privacyRequired()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "필수 약관에 동의해야 합니다.");
        }
        User user = getUser(userId);
        ConsentRecord consent = consentRecordRepository.findById(userId)
                .orElseGet(() -> consentRecordRepository.save(ConsentRecord.builder().user(user).build()));
        consent.update(
                request.termsRequired(),
                request.privacyRequired(),
                request.marketingOptional(),
                request.behaviorAnalyticsOptional()
        );
        return ConsentUpdateResponse.builder()
                .termsRequired(consent.isTermsRequired())
                .privacyRequired(consent.isPrivacyRequired())
                .marketingOptional(consent.isMarketingOptional())
                .behaviorAnalyticsOptional(consent.isBehaviorAnalyticsOptional())
                .updatedAt(consent.getConsentedAt())
                .build();
    }

    @Transactional
    public DeletionResponse requestDeletion(String userId, DeletionRequest request) {
        User user = getUser(userId);
        LocalDateTime scheduledAt = LocalDateTime.now().plusDays(30);
        user.requestDeletion(request.reason(), scheduledAt);
        return DeletionResponse.builder()
                .deletionScheduledAt(scheduledAt)
                .build();
    }

    @Transactional
    public void cancelDeletion(String userId) {
        getUser(userId).cancelDeletion();
    }

    private User getUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "인증 정보가 올바르지 않습니다."));
    }

    private ConsentInfo toConsentInfo(ConsentRecord consent) {
        if (consent == null) {
            return ConsentInfo.builder()
                    .termsRequired(false)
                    .privacyRequired(false)
                    .marketingOptional(false)
                    .behaviorAnalyticsOptional(false)
                    .updatedAt(null)
                    .build();
        }
        return ConsentInfo.builder()
                .termsRequired(consent.isTermsRequired())
                .privacyRequired(consent.isPrivacyRequired())
                .marketingOptional(consent.isMarketingOptional())
                .behaviorAnalyticsOptional(consent.isBehaviorAnalyticsOptional())
                .updatedAt(consent.getConsentedAt())
                .build();
    }
}
