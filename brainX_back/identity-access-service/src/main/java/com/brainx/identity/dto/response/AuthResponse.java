package com.brainx.identity.dto.response;

import com.brainx.identity.entity.ConsentRecord;
import com.brainx.identity.entity.OAuthAccount;
import com.brainx.identity.entity.User;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class AuthResponse {

    @Getter
    @Builder
    public static class TokenResponse {
        private String userId;
        private String accessToken;
        private String refreshToken;
        private boolean requires2fa;
        private String next;
    }

    @Getter
    @Builder
    public static class EmailVerificationResponse {
        private String verificationId;
        private LocalDateTime expiresAt;
    }

    @Getter
    @Builder
    public static class UserProfileResponse {
        private String userId;
        private String email;
        private ProfileInfo profile;
        private SecurityInfo security;
        private ConsentInfo consents;

        @Getter
        @Builder
        public static class ProfileInfo {
            private String nickname;
            private String profileImageUrl;
        }

        @Getter
        @Builder
        public static class SecurityInfo {
            private boolean twoFactorEnabled;
            private boolean emailVerified;
            private List<String> linkedProviders;
        }

        @Getter
        @Builder
        public static class ConsentInfo {
            private boolean termsRequired;
            private boolean privacyRequired;
            private boolean marketingOptional;
            private boolean behaviorAnalyticsOptional;
        }

        public static UserProfileResponse from(User user, ConsentRecord consent, List<OAuthAccount> oauthAccounts) {
            ProfileInfo profile = ProfileInfo.builder()
                    .nickname(user.getNickname())
                    .profileImageUrl(user.getProfileImageUrl())
                    .build();

            List<String> providers = oauthAccounts.stream()
                    .map(OAuthAccount::getProvider)
                    .toList();

            SecurityInfo security = SecurityInfo.builder()
                    .twoFactorEnabled(user.isTwoFactorEnabled())
                    .emailVerified(user.isEmailVerified())
                    .linkedProviders(providers)
                    .build();

            ConsentInfo consentInfo = null;
            if (consent != null) {
                consentInfo = ConsentInfo.builder()
                        .termsRequired(consent.isTermsRequired())
                        .privacyRequired(consent.isPrivacyRequired())
                        .marketingOptional(consent.isMarketingOptional())
                        .behaviorAnalyticsOptional(consent.isBehaviorAnalyticsOptional())
                        .build();
            }

            return UserProfileResponse.builder()
                    .userId(user.getUserId())
                    .email(user.getEmail())
                    .profile(profile)
                    .security(security)
                    .consents(consentInfo)
                    .build();
        }
    }

    @Getter
    @Builder
    public static class DeletionResponse {
        private LocalDateTime deletionScheduledAt;
    }

    @Getter
    @Builder
    public static class OAuthLinkResponse {
        private String provider;
        private boolean linked;
    }

    @Getter
    @Builder
    public static class OkResponse {
        private boolean ok;
    }
}
