package com.brainx.commerce.controller;

import com.brainx.commerce.dto.CommerceDtos.SubscriptionChangeRequest;
import com.brainx.commerce.dto.CommerceDtos.SubscriptionChangeData;
import com.brainx.commerce.entity.CheckoutSession;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.repository.CheckoutSessionRepository;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import com.brainx.commerce.service.CommerceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/internal/v1")
@RequiredArgsConstructor
public class InternalCommerceController {

    private final CheckoutSessionRepository checkoutSessionRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PlanRepository planRepository;
    private final CommerceService commerceService;

    @GetMapping("/billing/summary")
    public ResponseEntity<Map<String, Object>> getBillingSummary() {
        long activeSubscriptions = subscriptionRepository.countByStatus(Subscription.Status.ACTIVE);

        List<Subscription> activeSubs = subscriptionRepository.findByStatus(Subscription.Status.ACTIVE);
        Map<String, Long> planPrices = planRepository.findAll().stream()
                .collect(Collectors.toMap(Plan::getPlanId, Plan::getPrice, (p1, p2) -> p1));

        long mrrVal = activeSubs.stream()
                .mapToLong(sub -> planPrices.getOrDefault(sub.getPlanId(), 0L))
                .sum();

        List<CheckoutSession> succeededSessions = checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.SUCCEEDED);
        long monthlyRevenueVal = succeededSessions.stream()
                .mapToLong(CheckoutSession::getAmount)
                .sum();

        long failedPaymentCount = checkoutSessionRepository.findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status.FAILED).size();

        return ResponseEntity.ok(Map.of(
                "monthlyRevenue", BigDecimal.valueOf(monthlyRevenueVal),
                "activeSubscriptions", (int) activeSubscriptions,
                "mrr", BigDecimal.valueOf(mrrVal),
                "failedPaymentCount", (int) failedPaymentCount
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
    public ResponseEntity<Map<String, Object>> refundPayment(@PathVariable String paymentId) {
        CheckoutSession session = checkoutSessionRepository.findById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
        session.markFailed("Refunded by Admin", Instant.now());
        return ResponseEntity.ok(Map.of("paymentId", paymentId, "status", "REFUNDED", "acceptedAt", Instant.now().toString()));
    }

    @PostMapping("/billing/payments/{paymentId}/retry")
    @Transactional
    public ResponseEntity<Map<String, Object>> retryPayment(@PathVariable String paymentId) {
        CheckoutSession session = checkoutSessionRepository.findById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
        session.markSucceeded(session.getPaymentKey(), "retried-" + session.getPaymentId(), Instant.now());
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
                    session.getProvider().name(),
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
}
