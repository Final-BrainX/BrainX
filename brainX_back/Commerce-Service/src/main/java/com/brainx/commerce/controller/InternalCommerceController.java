package com.brainx.commerce.controller;

import com.brainx.commerce.dto.ApiResponse;
import com.brainx.commerce.dto.CommerceDtos.EntitlementsCheckData;
import com.brainx.commerce.dto.CommerceDtos.EntitlementsCheckRequest;
import com.brainx.commerce.dto.CommerceDtos.SubscriptionChangeRequest;
import com.brainx.commerce.dto.CommerceDtos.SubscriptionChangeData;
import com.brainx.commerce.entity.CheckoutSession;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.repository.CheckoutSessionRepository;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import com.brainx.commerce.service.CommerceService;
import com.brainx.commerce.service.EntitlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/internal/v1")
@RequiredArgsConstructor
public class InternalCommerceController {
    private static final ZoneId MONITORING_ZONE = ZoneId.of("Asia/Seoul");
    private static final int DEFAULT_TREND_DAYS = 14;
    private static final int MAX_TREND_DAYS = 31;

    private final CheckoutSessionRepository checkoutSessionRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PlanRepository planRepository;
    private final CommerceService commerceService;
    private final EntitlementService entitlementService;

    @PostMapping("/entitlements/check")
    public ResponseEntity<ApiResponse<EntitlementsCheckData>> checkEntitlements(
            @RequestBody EntitlementsCheckRequest request
    ) {
        EntitlementsCheckData data = entitlementService.checkAndConsume(request.userId(), request.guestId());
        return ResponseEntity.ok(ApiResponse.success(data, "권한/쿼터 확인 완료"));
    }

    @GetMapping("/billing/summary")
    public ResponseEntity<Map<String, Object>> getBillingSummary() {
        ZoneId zone = ZoneId.systemDefault();
        YearMonth currentMonth = YearMonth.now(zone);
        LocalDateTime monthStart = currentMonth.atDay(1).atStartOfDay();
        LocalDateTime nextMonthStart = currentMonth.plusMonths(1).atDay(1).atStartOfDay();

        List<Subscription> activeSubs = subscriptionRepository.findByStatus(Subscription.Status.ACTIVE).stream()
                .filter(subscription -> subscription.getPlanId() != null && !"free".equalsIgnoreCase(subscription.getPlanId()))
                .toList();
        Map<String, Long> planPrices = planRepository.findAll().stream()
                .collect(Collectors.toMap(Plan::getPlanId, Plan::getPrice, (p1, p2) -> p1));

        long mrrVal = activeSubs.stream()
                .mapToLong(sub -> planPrices.getOrDefault(sub.getPlanId(), 0L))
                .sum();

        List<CheckoutSession> succeededSessions = checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.SUCCEEDED).stream()
                .filter(session -> isInCurrentMonth(session.getConfirmedAt() != null ? session.getConfirmedAt() : session.getCreatedAt(), zone, currentMonth))
                .toList();
        long monthlyRevenueVal = succeededSessions.stream()
                .mapToLong(CheckoutSession::getAmount)
                .sum();

        long failedPaymentCount = checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.FAILED).stream()
                .filter(session -> isInCurrentMonth(session.getConfirmedAt() != null ? session.getConfirmedAt() : session.getCreatedAt(), zone, currentMonth))
                .count();

        return ResponseEntity.ok(Map.of(
                "monthlyRevenue", BigDecimal.valueOf(monthlyRevenueVal),
                "activeSubscriptions", activeSubs.size(),
                "mrr", BigDecimal.valueOf(mrrVal),
                "failedPaymentCount", (int) failedPaymentCount
        ));
    }

    @GetMapping("/billing/revenue-trend")
    public ResponseEntity<TrendSeriesDto> getRevenueTrend(@RequestParam(defaultValue = "14") Integer days) {
        int normalizedDays = normalizeTrendDays(days);
        LocalDate today = LocalDate.now(MONITORING_ZONE);
        LocalDate startDate = today.minusDays(normalizedDays - 1L);

        Map<LocalDate, Integer> revenueByDay = new LinkedHashMap<>();
        for (int i = 0; i < normalizedDays; i++) {
            revenueByDay.put(startDate.plusDays(i), 0);
        }

        checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.SUCCEEDED).forEach(session -> {
            Instant occurredAt = session.getConfirmedAt() != null ? session.getConfirmedAt() : session.getCreatedAt();
            if (occurredAt == null) {
                return;
            }
            LocalDate occurredDate = occurredAt.atZone(MONITORING_ZONE).toLocalDate();
            if (occurredDate.isBefore(startDate) || occurredDate.isAfter(today)) {
                return;
            }
            revenueByDay.computeIfPresent(
                    occurredDate,
                    (ignored, current) -> safeToInt((long) current + session.getAmount())
            );
        });

        return ResponseEntity.ok(new TrendSeriesDto(
                "dailyRevenue",
                List.copyOf(revenueByDay.values()),
                "최근 " + normalizedDays + "일 일별 매출",
                normalizedDays,
                MONITORING_ZONE.getId(),
                "Commerce-Service"
        ));
    }

    @GetMapping("/billing/payments")
    public ResponseEntity<List<PaymentDto>> listPayments() {
        List<CheckoutSession> sessions = checkoutSessionRepository.findAllByOrderByCreatedAtDesc();
        List<PaymentDto> dtos = sessions.stream()
                .map(PaymentDto::from)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/billing/subscriptions")
    public ResponseEntity<List<SubscriptionDto>> listSubscriptions() {
        List<Subscription> subs = subscriptionRepository.findAllByOrderByCreatedAtDesc();
        List<SubscriptionDto> dtos = subs.stream()
                .map(SubscriptionDto::from)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @PatchMapping("/billing/subscriptions/{userId}/plan")
    @Transactional
    public ResponseEntity<SubscriptionChangeData> changeSubscriptionPlan(
            @PathVariable String userId,
            @RequestBody Map<String, Object> body
    ) {
        SubscriptionChangeRequest request = new SubscriptionChangeRequest();
        request.setTargetPlanId((String) body.get("targetPlanId"));
        return ResponseEntity.ok(commerceService.changeSubscription(userId, request));
    }

    @GetMapping("/billing/failures")
    public ResponseEntity<List<PaymentFailureDto>> listPaymentFailures() {
        List<CheckoutSession> sessions = checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.FAILED);
        List<PaymentFailureDto> dtos = sessions.stream()
                .map(PaymentFailureDto::from)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @PatchMapping("/plans/{planId}")
    @Transactional
    public ResponseEntity<PlanDto> updatePlanPrice(
            @PathVariable String planId,
            @RequestBody Map<String, Object> body
    ) {
        Plan plan = planRepository.findById(planId)
                .orElseThrow(() -> new IllegalArgumentException("Plan not found: " + planId));

        long price = ((Number) body.get("price")).longValue();
        String currency = (String) body.get("currency");
        plan.updatePlanPrice(price, currency);

        return ResponseEntity.ok(PlanDto.from(plan));
    }

    @PostMapping("/billing/payments/{paymentId}/refund")
    @Transactional
    public ResponseEntity<Map<String, Object>> refundPayment(
            @PathVariable String paymentId,
            @RequestBody(required = false) RefundPaymentRequest request
    ) {
        CommerceService.PaymentRefundData refunded = commerceService.refundPayment(
                paymentId,
                request == null ? null : request.amount(),
                request == null ? null : request.reason()
        );
        return ResponseEntity.ok(Map.of(
                "paymentId", refunded.paymentId(),
                "status", "REFUNDED",
                "acceptedAt", refunded.refundedAt().toString()
        ));
    }

    @PostMapping("/billing/payments/{paymentId}/retry")
    @Transactional
    public ResponseEntity<Map<String, Object>> retryPayment(@PathVariable String paymentId) {
        CheckoutSession session = checkoutSessionRepository.findById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
        session.markSucceeded(session.getPaymentKey(), "retried-" + session.getPaymentId(), session.getPaymentMethod(), Instant.now());
        return ResponseEntity.ok(Map.of("paymentId", paymentId, "status", "RETRY_SUCCESS", "acceptedAt", Instant.now().toString()));
    }

    @DeleteMapping("/billing/payments/{paymentId}")
    @Transactional
    public ResponseEntity<Void> deletePayment(@PathVariable String paymentId) {
        CheckoutSession session = checkoutSessionRepository.findById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
        checkoutSessionRepository.delete(session);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/billing/subscriptions/{subscriptionId}")
    @Transactional
    public ResponseEntity<Void> deleteSubscription(@PathVariable String subscriptionId) {
        Subscription subscription = subscriptionRepository.findAll().stream()
                .filter(sub -> sub.getSubscriptionId().equals(subscriptionId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Subscription not found: " + subscriptionId));
        subscriptionRepository.delete(subscription);
        return ResponseEntity.noContent().build();
    }

    public record PaymentDto(
            String paymentId,
            String transactionId,
            String userId,
            String planId,
            BigDecimal amount,
            String currency,
            String method,
            String status,
            Instant paidAt,
            String failureReason
    ) {
        public static PaymentDto from(CheckoutSession session) {
            return new PaymentDto(
                    session.getCheckoutSessionId(),
                    session.getPaymentId(),
                    session.getUserId(),
                    session.getPlanId(),
                    BigDecimal.valueOf(session.getAmount()),
                    session.getCurrency(),
                    session.getPaymentMethod() != null && !session.getPaymentMethod().isBlank()
                            ? session.getPaymentMethod()
                            : "기타",
                    session.getStatus().name(),
                    session.getConfirmedAt() != null ? session.getConfirmedAt() : session.getCreatedAt(),
                    session.getFailureReason()
            );
        }
    }

    public record SubscriptionDto(
            String subscriptionId,
            String userId,
            String planId,
            String status,
            Instant startedAt,
            Instant nextBillingAt,
            BigDecimal amount,
            String currency
    ) {
        public static SubscriptionDto from(Subscription sub) {
            return new SubscriptionDto(
                    sub.getSubscriptionId(),
                    sub.getUserId(),
                    sub.getPlanId(),
                    sub.getStatus().name(),
                    sub.getCreatedAt(),
                    sub.getRenewalAt(),
                    BigDecimal.ZERO,
                    "KRW"
            );
        }
    }

    public record PaymentFailureDto(
            String paymentId,
            String userId,
            String planId,
            BigDecimal amount,
            String currency,
            String reason,
            int retryCount,
            Instant failedAt
    ) {
        public static PaymentFailureDto from(CheckoutSession session) {
            return new PaymentFailureDto(
                    session.getCheckoutSessionId(),
                    session.getUserId(),
                    session.getPlanId(),
                    BigDecimal.valueOf(session.getAmount()),
                    session.getCurrency(),
                    session.getFailureReason() != null ? session.getFailureReason() : "Unknown card error",
                    1,
                    session.getConfirmedAt() != null ? session.getConfirmedAt() : session.getCreatedAt()
            );
        }
    }

    public record PlanDto(
            String planId,
            String name,
            BigDecimal price,
            String currency,
            String description,
            Instant effectiveAt
    ) {
        public static PlanDto from(Plan plan) {
            return new PlanDto(
                    plan.getPlanId(),
                    plan.getName(),
                    BigDecimal.valueOf(plan.getPrice()),
                    plan.getCurrency(),
                    String.join(", ", plan.getFeatures()),
                    Instant.now()
            );
        }
    }

    public record TrendSeriesDto(
            String metric,
            List<Integer> values,
            String periodLabel,
            int pointCount,
            String timezone,
            String source
    ) {}

    private boolean isInCurrentMonth(Instant instant, ZoneId zone, YearMonth month) {
        if (instant == null) {
            return false;
        }
        LocalDateTime value = LocalDateTime.ofInstant(instant, zone);
        return YearMonth.from(value).equals(month);
    }

    private int normalizeTrendDays(Integer days) {
        if (days == null) {
            return DEFAULT_TREND_DAYS;
        }
        return Math.max(1, Math.min(MAX_TREND_DAYS, days));
    }

    private int safeToInt(long value) {
        if (value > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        if (value < Integer.MIN_VALUE) {
            return Integer.MIN_VALUE;
        }
        return (int) value;
    }

    public record RefundPaymentRequest(BigDecimal amount, String reason) {}
}
