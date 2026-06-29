package brain.web.mvc.controller;

import brain.web.mvc.dto.request.UserRequests.ChangePasswordRequest;
import brain.web.mvc.dto.request.UserRequests.DeletionRequest;
import brain.web.mvc.dto.request.UserRequests.EmailTwoFactorRequest;
import brain.web.mvc.dto.request.UserRequests.LinkSocialAccountRequest;
import brain.web.mvc.dto.request.UserRequests.UpdateConsentRequest;
import brain.web.mvc.dto.request.UserRequests.UpdateProfileRequest;
import brain.web.mvc.dto.response.ApiResponse;
import brain.web.mvc.dto.response.UserResponses.ConsentUpdateResponse;
import brain.web.mvc.dto.response.UserResponses.DeletionResponse;
import brain.web.mvc.dto.response.UserResponses.MyProfileResponse;
import brain.web.mvc.dto.response.UserResponses.NotificationItemResponse;
import brain.web.mvc.dto.response.UserResponses.NotificationsResponse;
import brain.web.mvc.dto.response.UserResponses.ProfileUpdateResponse;
import brain.web.mvc.dto.response.UserResponses.SocialAccountResponse;
import brain.web.mvc.dto.response.UserResponses.TwoFactorResponse;
import brain.web.mvc.service.UserNotificationService;
import brain.web.mvc.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;
    private final UserNotificationService userNotificationService;

    @GetMapping
    public ResponseEntity<ApiResponse<MyProfileResponse>> getMyProfile(@AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(userService.getMyProfile(userDetails.getUsername()), "내 정보 조회 성공"));
    }

    @PatchMapping("/profile")
    public ResponseEntity<ApiResponse<ProfileUpdateResponse>> updateProfile(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.updateProfile(userDetails.getUsername(), request), "프로필이 저장되었습니다."));
    }

    @PatchMapping("/password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        userService.changePassword(userDetails.getUsername(), request);
        return ResponseEntity.ok(ApiResponse.success(null, "비밀번호가 변경되었습니다."));
    }

    @PostMapping("/2fa/email")
    public ResponseEntity<ApiResponse<TwoFactorResponse>> configureEmailTwoFactor(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody EmailTwoFactorRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.configureEmailTwoFactor(userDetails.getUsername(), request), "2단계 인증 설정이 요청되었습니다."));
    }

    @PostMapping("/social-accounts")
    public ResponseEntity<ApiResponse<SocialAccountResponse>> linkSocialAccount(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody LinkSocialAccountRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.linkSocialAccount(userDetails.getUsername(), request), "소셜 계정이 연결되었습니다."));
    }

    @DeleteMapping("/social-accounts/{provider}")
    public ResponseEntity<ApiResponse<SocialAccountResponse>> unlinkSocialAccount(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String provider
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.unlinkSocialAccount(userDetails.getUsername(), provider), "소셜 계정 연결이 해제되었습니다."));
    }

    @PutMapping("/consents")
    public ResponseEntity<ApiResponse<ConsentUpdateResponse>> updateConsents(
            @AuthenticationPrincipal UserDetails userDetails,
            @Valid @RequestBody UpdateConsentRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.updateConsents(userDetails.getUsername(), request), "동의 정보가 수정되었습니다."));
    }

    @PostMapping("/deletion-request")
    public ResponseEntity<ApiResponse<DeletionResponse>> requestDeletion(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestBody DeletionRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.requestDeletion(userDetails.getUsername(), request), "회원 탈퇴 요청이 접수되었습니다. 30일 후 데이터가 삭제됩니다."));
    }

    @DeleteMapping("/deletion-request")
    public ResponseEntity<ApiResponse<Void>> cancelDeletion(@AuthenticationPrincipal UserDetails userDetails) {
        userService.cancelDeletion(userDetails.getUsername());
        return ResponseEntity.ok(ApiResponse.success(null, "회원 탈퇴 요청이 취소되었습니다."));
    }
    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<NotificationsResponse>> getNotifications(@AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(userNotificationService.getMyNotifications(userDetails.getUsername()), "알림을 조회했습니다."));
    }

    @PostMapping("/notifications/{notificationId}/read")
    public ResponseEntity<ApiResponse<NotificationItemResponse>> markNotificationRead(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable String notificationId
    ) {
        return ResponseEntity.ok(ApiResponse.success(userNotificationService.markAsRead(userDetails.getUsername(), notificationId), "알림을 읽음 처리했습니다."));
    }
}
