package brain.web.mvc.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class UserRequests {

    public record UpdateProfileRequest(
            String nickname,
            String profileImageAssetId
    ) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "현재 비밀번호는 필수입니다.")
            String currentPassword,

            @NotBlank(message = "새 비밀번호는 필수입니다.")
            String newPassword,

            @NotBlank(message = "새 비밀번호 확인은 필수입니다.")
            String newPasswordConfirm
    ) {
    }

    public record EmailTwoFactorRequest(
            @NotNull(message = "2단계 인증 설정 값은 필수입니다.")
            Boolean enabled
    ) {
    }

    public record LinkSocialAccountRequest(
            @NotBlank(message = "소셜 로그인 제공자는 필수입니다.")
            String provider,

            @NotBlank(message = "OAuth code는 필수입니다.")
            String oauthCode
    ) {
    }

    public record UpdateConsentRequest(
            boolean termsRequired,
            boolean privacyRequired,
            boolean marketingOptional,
            boolean behaviorAnalyticsOptional
    ) {
    }

    public record DeletionRequest(
            String reason
    ) {
    }
}
