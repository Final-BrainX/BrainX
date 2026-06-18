package brain.web.mvc.dto.response;

import lombok.Builder;

import java.time.LocalDateTime;

public class AuthResponses {

    @Builder
    public record EmailVerificationResponse(
            String verificationId,
            String email,
            LocalDateTime expiresAt
    ) {
    }

    @Builder
    public record EmailVerificationCheckResponse(
            boolean verified,
            String email
    ) {
    }

    @Builder
    public record EmailAvailabilityResponse(
            String email,
            boolean available
    ) {
    }

    @Builder
    public record AuthTokenResponse(
            String userId,
            String email,
            String nickname,
            String profileImageUrl,
            String role,
            String accessToken,
            String refreshToken,
            String tokenType,
            boolean requires2fa,
            String next
    ) {
    }

    @Builder
    public record TemporaryPasswordIssueResponse(
            String email,
            boolean issued
    ) {
    }

    @Builder
    public record TokenRefreshResponse(
            String accessToken,
            String refreshToken,
            String tokenType
    ) {
    }

    @Builder
    public record OAuthAuthorizeResponse(
            String provider,
            String authorizationUrl,
            String state
    ) {
    }

    @Builder
    public record OAuthCallbackResponse(
            String userId,
            String email,
            String nickname,
            String profileImageUrl,
            String accessToken,
            String refreshToken,
            String tokenType,
            String onboardingToken,
            boolean accountLinked,
            boolean isNewUser,
            String next
    ) {
    }
}