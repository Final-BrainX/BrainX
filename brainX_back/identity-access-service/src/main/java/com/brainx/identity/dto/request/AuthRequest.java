package com.brainx.identity.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class AuthRequest {

    @Getter
    @NoArgsConstructor
    public static class EmailVerificationRequest {
        @Email(message = "올바른 이메일 형식이 아닙니다")
        @NotBlank(message = "이메일은 필수입니다")
        private String email;

        @NotBlank(message = "목적은 필수입니다")
        @Pattern(regexp = "signup|passwordChange", message = "올바른 목적값이 아닙니다")
        private String purpose;
    }

    @Getter
    @NoArgsConstructor
    public static class EmailSignupRequest {
        @Email(message = "올바른 이메일 형식이 아닙니다")
        @NotBlank(message = "이메일은 필수입니다")
        private String email;

        @NotBlank(message = "인증 코드는 필수입니다")
        private String code;

        @NotBlank(message = "비밀번호는 필수입니다")
        @Size(min = 8, max = 100, message = "비밀번호는 8자 이상이어야 합니다")
        private String password;

        private ConsentRequest consents;
    }

    @Getter
    @NoArgsConstructor
    public static class LoginRequest {
        @Email(message = "올바른 이메일 형식이 아닙니다")
        @NotBlank(message = "이메일은 필수입니다")
        private String email;

        @NotBlank(message = "비밀번호는 필수입니다")
        private String password;
    }

    @Getter
    @NoArgsConstructor
    public static class LogoutRequest {
        private String sessionId;
    }

    @Getter
    @NoArgsConstructor
    public static class RefreshTokenRequest {
        @NotBlank(message = "리프레시 토큰은 필수입니다")
        private String refreshToken;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateProfileRequest {
        @Size(max = 50, message = "닉네임은 50자 이하여야 합니다")
        private String nickname;
        private String profileImageAssetId;
    }

    @Getter
    @NoArgsConstructor
    public static class ChangePasswordRequest {
        @NotBlank(message = "현재 비밀번호는 필수입니다")
        private String currentPassword;

        @NotBlank(message = "새 비밀번호는 필수입니다")
        @Size(min = 8, max = 100, message = "비밀번호는 8자 이상이어야 합니다")
        private String newPassword;
    }

    @Getter
    @NoArgsConstructor
    public static class ConsentRequest {
        private boolean termsRequired;
        private boolean privacyRequired;
        private boolean marketingOptional;
        private boolean behaviorAnalyticsOptional;
    }

    @Getter
    @NoArgsConstructor
    public static class DeleteAccountRequest {
        private String reason;
    }

    @Getter
    @NoArgsConstructor
    public static class OAuthCallbackRequest {
        @NotBlank(message = "code는 필수입니다")
        private String code;

        @NotBlank(message = "state는 필수입니다")
        private String state;
    }
}
