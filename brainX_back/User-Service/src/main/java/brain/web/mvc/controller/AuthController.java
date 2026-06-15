package brain.web.mvc.controller;

import brain.web.mvc.dto.request.AuthRequests.EmailSignupRequest;
import brain.web.mvc.dto.request.AuthRequests.EmailVerificationCheckRequest;
import brain.web.mvc.dto.request.AuthRequests.EmailVerificationRequest;
import brain.web.mvc.dto.request.AuthRequests.LoginRequest;
import brain.web.mvc.dto.request.AuthRequests.LogoutRequest;
import brain.web.mvc.dto.request.AuthRequests.OAuthCallbackRequest;
import brain.web.mvc.dto.request.AuthRequests.OnboardingCompleteRequest;
import brain.web.mvc.dto.request.AuthRequests.RefreshTokenRequest;
import brain.web.mvc.dto.response.ApiResponse;
import brain.web.mvc.dto.response.AuthResponses.AuthTokenResponse;
import brain.web.mvc.dto.response.AuthResponses.EmailVerificationCheckResponse;
import brain.web.mvc.dto.response.AuthResponses.EmailVerificationResponse;
import brain.web.mvc.dto.response.AuthResponses.OAuthAuthorizeResponse;
import brain.web.mvc.dto.response.AuthResponses.OAuthCallbackResponse;
import brain.web.mvc.dto.response.AuthResponses.TokenRefreshResponse;
import brain.web.mvc.entity.EmailVerification;
import brain.web.mvc.service.AuthService;
import brain.web.mvc.service.EmailVerificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;

    @PostMapping("/email-verifications")
    public ResponseEntity<ApiResponse<EmailVerificationResponse>> requestEmailVerification(
            @Valid @RequestBody EmailVerificationRequest request
    ) {
        EmailVerification verification = emailVerificationService.requestVerification(request.email(), request.purpose());
        EmailVerificationResponse response = EmailVerificationResponse.builder()
                .verificationId(verification.getVerificationId())
                .email(verification.getEmail())
                .expiresAt(verification.getExpiresAt())
                .build();
        return ResponseEntity.ok(ApiResponse.success(response, "인증 코드가 이메일로 발송되었습니다."));
    }

    @PostMapping("/email-verifications/verify")
    public ResponseEntity<ApiResponse<EmailVerificationCheckResponse>> verifyEmailCode(
            @Valid @RequestBody EmailVerificationCheckRequest request
    ) {
        boolean verified = emailVerificationService.checkVerificationCode(
                request.email(),
                request.verificationCode(),
                request.purpose()
        );
        if (!verified) {
            return ResponseEntity
                    .badRequest()
                    .body(ApiResponse.failure("인증 코드가 올바르지 않습니다."));
        }

        EmailVerificationCheckResponse response = EmailVerificationCheckResponse.builder()
                .verified(true)
                .email(request.email())
                .build();
        return ResponseEntity.ok(ApiResponse.success(response, "인증 코드가 확인되었습니다."));
    }

    @PostMapping("/signup/email")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> signup(@Valid @RequestBody EmailSignupRequest request) {
        AuthTokenResponse response = authService.signup(request);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "회원가입이 완료되었습니다."));
    }

    @PostMapping("/login/local")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthTokenResponse response = authService.login(request);
        String message = response.requires2fa() ? "2단계 인증이 필요합니다." : "로그인 성공";
        return ResponseEntity.ok(ApiResponse.success(response, message));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.ok(ApiResponse.success(null, "로그아웃되었습니다."));
    }

    @PostMapping("/token/refresh")
    public ResponseEntity<ApiResponse<TokenRefreshResponse>> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        TokenRefreshResponse response = authService.refresh(request.refreshToken());
        return ResponseEntity.ok(ApiResponse.success(response, "토큰이 재발급되었습니다."));
    }

    @GetMapping("/oauth/{provider}/authorize")
    public ResponseEntity<ApiResponse<OAuthAuthorizeResponse>> authorizeOAuth(@PathVariable String provider) {
        OAuthAuthorizeResponse response = authService.authorizeOAuth(provider);
        return ResponseEntity.ok(ApiResponse.success(response, "소셜 로그인 URL이 생성되었습니다."));
    }

    @PostMapping("/oauth/{provider}/callback")
    public ResponseEntity<ApiResponse<OAuthCallbackResponse>> completeOAuth(
            @PathVariable String provider,
            @Valid @RequestBody OAuthCallbackRequest request
    ) {
        OAuthCallbackResponse response = authService.completeOAuth(provider, request.code(), request.state());
        return ResponseEntity.ok(ApiResponse.success(response, "소셜 로그인이 완료되었습니다."));
    }

    @PostMapping("/onboarding/complete")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> completeOnboarding(
            @Valid @RequestBody OnboardingCompleteRequest request
    ) {
        AuthTokenResponse response = authService.completeOnboarding(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "온보딩이 완료되었습니다."));
    }
}
