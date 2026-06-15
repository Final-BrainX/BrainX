package com.brainx.identity.controller;

import com.brainx.identity.dto.request.AuthRequest.*;
import com.brainx.identity.dto.response.ApiResponse;
import com.brainx.identity.dto.response.AuthResponse.*;
import com.brainx.identity.security.CustomUserDetails;
import com.brainx.identity.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // POST /v1/auth/email-verifications
    @PostMapping("/auth/email-verifications")
    public ResponseEntity<ApiResponse<EmailVerificationResponse>> requestEmailVerification(
            @Valid @RequestBody EmailVerificationRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.requestEmailVerification(request)));
    }

    // POST /v1/auth/email-signups
    @PostMapping("/auth/email-signups")
    public ResponseEntity<ApiResponse<TokenResponse>> signup(
            @Valid @RequestBody EmailSignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(authService.signup(request)));
    }

    // POST /v1/auth/login
    @PostMapping("/auth/login")
    public ResponseEntity<ApiResponse<TokenResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.login(request)));
    }

    // POST /v1/auth/logout
    @PostMapping("/auth/logout")
    public ResponseEntity<ApiResponse<OkResponse>> logout(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(authService.logout(userDetails.getUserId())));
    }

    // GET /v1/users/me
    @GetMapping("/users/me")
    public ResponseEntity<ApiResponse<UserProfileResponse>> getMyProfile(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(authService.getMyProfile(userDetails.getUserId())));
    }

    // PATCH /v1/users/me/profile
    @PatchMapping("/users/me/profile")
    public ResponseEntity<ApiResponse<UserProfileResponse>> updateProfile(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(ApiResponse.success(authService.updateProfile(userDetails.getUserId(), request)));
    }

    // PATCH /v1/users/me/password
    @PatchMapping("/users/me/password")
    public ResponseEntity<ApiResponse<OkResponse>> changePassword(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(userDetails.getUserId(), request);
        return ResponseEntity.ok(ApiResponse.success(OkResponse.builder().ok(true).build()));
    }

    // PUT /v1/users/me/consents
    @PutMapping("/users/me/consents")
    public ResponseEntity<ApiResponse<OkResponse>> updateConsents(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestBody ConsentRequest request) {
        authService.updateConsents(userDetails.getUserId(), request);
        return ResponseEntity.ok(ApiResponse.success(OkResponse.builder().ok(true).build()));
    }

    // POST /v1/users/me/deletion-request
    @PostMapping("/users/me/deletion-request")
    public ResponseEntity<ApiResponse<DeletionResponse>> requestDeletion(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(authService.requestAccountDeletion(userDetails.getUserId())));
    }

    // DELETE /v1/users/me/deletion-request
    @DeleteMapping("/users/me/deletion-request")
    public ResponseEntity<ApiResponse<OkResponse>> cancelDeletion(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(ApiResponse.success(authService.cancelAccountDeletion(userDetails.getUserId())));
    }
}
