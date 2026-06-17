package brain.web.mvc.dto.request;

import brain.web.mvc.entity.VerificationPurpose;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class AuthRequests {

    public record EmailVerificationRequest(
            @Email(message = "이메일 형식이 올바르지 않습니다.")
            @NotBlank(message = "이메일은 필수입니다.")
            String email,

            @NotNull(message = "인증 목적은 필수입니다.")
            VerificationPurpose purpose
    ) {
    }

    public record EmailVerificationCheckRequest(
            @Email(message = "이메일 형식이 올바르지 않습니다.")
            @NotBlank(message = "이메일은 필수입니다.")
            String email,

            @NotBlank(message = "인증 코드는 필수입니다.")
            String verificationCode,

            @NotNull(message = "인증 목적은 필수입니다.")
            VerificationPurpose purpose
    ) {
    }

    public record EmailSignupRequest(
            @Email(message = "이메일 형식이 올바르지 않습니다.")
            @NotBlank(message = "이메일은 필수입니다.")
            String email,

            @NotBlank(message = "인증 코드는 필수입니다.")
            String verificationCode,

            @NotBlank(message = "비밀번호는 필수입니다.")
            String password,

            @NotBlank(message = "비밀번호 확인은 필수입니다.")
            String passwordConfirm,

            @Valid
            @NotNull(message = "약관 동의 정보는 필수입니다.")
            ConsentRequest consents
    ) {
    }

    public record ConsentRequest(
            boolean termsRequired,
            boolean privacyRequired,
            boolean marketingOptional,
            boolean behaviorAnalyticsOptional
    ) {
        @AssertTrue(message = "필수 약관에 동의해야 회원가입이 가능합니다.")
        public boolean isRequiredConsentsAccepted() {
            return termsRequired && privacyRequired;
        }
    }

    public record LoginRequest(
            @Email(message = "이메일 형식이 올바르지 않습니다.")
            @NotBlank(message = "이메일은 필수입니다.")
            String email,

            @NotBlank(message = "비밀번호는 필수입니다.")
            String password
    ) {
    }

    public record TemporaryPasswordIssueRequest(
            @Email(message = "이메일 형식이 올바르지 않습니다.")
            @NotBlank(message = "이메일은 필수입니다.")
            String email,

            @NotBlank(message = "인증 코드는 필수입니다.")
            String verificationCode
    ) {
    }

    public record LogoutRequest(
            @NotBlank(message = "Refresh Token은 필수입니다.")
            String refreshToken
    ) {
    }

    public record RefreshTokenRequest(
            @NotBlank(message = "Refresh Token은 필수입니다.")
            String refreshToken
    ) {
    }

    public record OAuthCallbackRequest(
            @NotBlank(message = "code는 필수입니다.")
            String code,

            @NotBlank(message = "state는 필수입니다.")
            String state
    ) {
    }

    public record OnboardingCompleteRequest(
            @NotBlank(message = "온보딩 토큰은 필수입니다.")
            String onboardingToken,

            @NotBlank(message = "닉네임은 필수입니다.")
            String nickname,

            String profileImageUrl,

            List<String> interests,

            @Valid
            @NotNull(message = "약관 동의 정보는 필수입니다.")
            ConsentRequest consents
    ) {
    }
}
