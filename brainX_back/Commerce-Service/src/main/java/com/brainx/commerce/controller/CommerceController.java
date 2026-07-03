package com.brainx.commerce.controller;

import com.brainx.commerce.dto.ApiResponse;
import com.brainx.commerce.dto.CommerceDtos.*;
import com.brainx.commerce.service.CommerceService;
import com.brainx.commerce.service.TokenUsageService;
import com.brainx.commerce.security.AuthenticatedUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CommerceController {

    private final CommerceService commerceService;
    private final TokenUsageService tokenUsageService;

    // TEMP: 로그인 없이 결제 기능 테스트할 때 쓰는 고정 사용자 ID. 실제 로그인 연동 완료 후 제거할 것.
    private static final String DEV_TEST_USER_ID = "dev-test-user";

    private static String resolveUserId(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser user) {
            return user.userId();
        }
        return auth != null ? auth.getName() : DEV_TEST_USER_ID;
    }

    // GET /api/v1/plans
    @GetMapping("/plans")
    public ResponseEntity<ApiResponse<PlansData>> listPlans() {
        return ResponseEntity.ok(ApiResponse.success(commerceService.listPlans(), "플랜 목록 조회 성공"));
    }

    // GET /api/v1/users/me/subscription
    @GetMapping("/users/me/subscription")
    public ResponseEntity<ApiResponse<SubscriptionData>> getMySubscription(Authentication auth) {
        SubscriptionData data = commerceService.getMySubscription(resolveUserId(auth));
        return ResponseEntity.ok(ApiResponse.success(data, "내 구독 정보 조회 성공"));
    }

    // GET /api/v1/users/me/token-usage
    @GetMapping("/users/me/token-usage")
    public ResponseEntity<ApiResponse<TokenUsageData>> getMyTokenUsage(
            Authentication auth,
            @RequestParam(required = false) String month) {
        YearMonth ym = month != null ? YearMonth.parse(month) : YearMonth.now();
        TokenUsageData data = tokenUsageService.getMyTokenUsage(resolveUserId(auth), ym);
        return ResponseEntity.ok(ApiResponse.success(data, "토큰 사용량 조회 성공"));
    }

    // POST /api/v1/subscriptions/checkout-sessions
    @PostMapping("/subscriptions/checkout-sessions")
    public ResponseEntity<ApiResponse<CheckoutSessionData>> createCheckoutSession(
            Authentication auth,
            @Valid @RequestBody CheckoutSessionCreateRequest request) {
        CheckoutSessionData data = commerceService.createCheckoutSession(resolveUserId(auth), request);
        return ResponseEntity.ok(ApiResponse.success(data, "결제 체크아웃 세션이 생성되었습니다."));
    }

    // POST /api/v1/subscriptions/checkout-sessions/{checkoutSessionId}/confirm
    @PostMapping("/subscriptions/checkout-sessions/{checkoutSessionId}/confirm")
    public ResponseEntity<ApiResponse<CheckoutSessionConfirmData>> confirmCheckoutSession(
            Authentication auth,
            @PathVariable String checkoutSessionId,
            @Valid @RequestBody CheckoutSessionConfirmRequest request) {
        CheckoutSessionConfirmData data = commerceService.confirmCheckoutSession(resolveUserId(auth), checkoutSessionId, request);
        return ResponseEntity.ok(ApiResponse.success(data, "결제가 승인되었습니다."));
    }

    // POST /api/v1/subscriptions/change
    @PostMapping("/subscriptions/change")
    public ResponseEntity<ApiResponse<SubscriptionChangeData>> changeSubscription(
            Authentication auth,
            @Valid @RequestBody SubscriptionChangeRequest request) {
        SubscriptionChangeData data = commerceService.changeSubscription(resolveUserId(auth), request);
        return ResponseEntity.ok(ApiResponse.success(data, "구독 플랜이 변경되었습니다."));
    }

    // POST /api/v1/subscriptions/cancel
    @PostMapping("/subscriptions/cancel")
    public ResponseEntity<ApiResponse<SubscriptionCancelData>> cancelSubscription(
            Authentication auth,
            @Valid @RequestBody SubscriptionCancelRequest request) {
        SubscriptionCancelData data = commerceService.cancelSubscription(resolveUserId(auth), request);
        return ResponseEntity.ok(ApiResponse.success(data, "구독이 취소되었습니다."));
    }
}
