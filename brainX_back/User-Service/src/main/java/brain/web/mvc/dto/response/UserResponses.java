package brain.web.mvc.dto.response;

import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

public class UserResponses {

    @Builder
    public record MyProfileResponse(
            String userId,
            String email,
            String nickname,
            String profileImageUrl,
            String role,
            SecurityInfo security,
            ConsentInfo consents
    ) {
    }

    @Builder
    public record SecurityInfo(
            boolean twoFactorEnabled,
            List<String> linkedProviders
    ) {
    }

    @Builder
    public record ConsentInfo(
            boolean termsRequired,
            boolean privacyRequired,
            boolean marketingOptional,
            boolean behaviorAnalyticsOptional,
            LocalDateTime updatedAt
    ) {
    }

    @Builder
    public record ProfileUpdateResponse(
            String userId,
            String nickname,
            String profileImageUrl
    ) {
    }

    @Builder
    public record TwoFactorResponse(
            String verificationId
    ) {
    }

    @Builder
    public record SocialAccountResponse(
            String provider,
            boolean linked
    ) {
    }

    @Builder
    public record ConsentUpdateResponse(
            boolean termsRequired,
            boolean privacyRequired,
            boolean marketingOptional,
            boolean behaviorAnalyticsOptional,
            LocalDateTime updatedAt
    ) {
    }

    @Builder
    public record DeletionResponse(
            LocalDateTime deletionScheduledAt
    ) {
    }
}
