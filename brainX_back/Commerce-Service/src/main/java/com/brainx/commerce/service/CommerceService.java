package com.brainx.commerce.service;

import com.brainx.commerce.client.TossPaymentsClient;
import com.brainx.commerce.dto.CommerceDtos.*;
import com.brainx.commerce.entity.CheckoutSession;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.event.CommerceEventPublisher;
import com.brainx.commerce.exception.CommerceException;
import com.brainx.commerce.repository.CheckoutSessionRepository;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class CommerceService {

    private final PlanRepository planRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final CheckoutSessionRepository checkoutSessionRepository;
    private final CommerceEventPublisher eventPublisher;
    private final TossPaymentsClient tossPaymentsClient;

    @Value("${toss.client-key}")
    private String tossClientKey;

    @Transactional(readOnly = true)
    public PlansData listPlans() {
        return PlansData.from(planRepository.findByActiveTrueOrderByTierAsc());
    }

    public SubscriptionData getMySubscription(String userId) {
        Subscription subscription = findOrCreateSubscription(userId);
        Plan plan = plan(subscription.getPlanId());
        return SubscriptionData.of(subscription, plan);
    }

    // ── 결제 체크아웃 ─────────────────────────────────────────────────

    public CheckoutSessionData createCheckoutSession(String userId, CheckoutSessionCreateRequest request) {
        Plan plan = plan(request.getPlanId());
        if (plan.getPrice() <= 0) {
            throw CommerceException.badRequest("INVALID_PLAN", "무료 플랜은 결제로 전환할 수 없습니다.");
        }

        Instant now = Instant.now();
        CheckoutSession session = new CheckoutSession(
                Ids.checkoutSession(), userId, plan.getPlanId(), plan.getPrice(), plan.getCurrency(),
                CheckoutSession.Provider.TOSS, now, now.plus(30, ChronoUnit.MINUTES)
        );
        checkoutSessionRepository.save(session);

        eventPublisher.publish("CheckoutSessionCreated", userId, Map.of(
                "checkoutSessionId", session.getCheckoutSessionId(),
                "userId", userId,
                "planId", plan.getPlanId(),
                "provider", "toss"
        ));

        log.info("체크아웃 세션 생성: checkoutSessionId={}, userId={}, planId={}, amount={}",
                session.getCheckoutSessionId(), userId, plan.getPlanId(), plan.getPrice());

        return CheckoutSessionData.forToss(session, tossClientKey, "BrainX " + plan.getName() + " 플랜");
    }

    // 실패 경로(금액 위변조/만료/Toss 거절)에서는 "실패 상태를 커밋하고 에러를 던지는" 것이
    // 의도된 동작이다. 클래스 레벨 @Transactional 기본값(런타임 예외 시 전체 롤백)을 따르면
    // 방금 저장한 실패 기록까지 같이 롤백돼 버리므로, 이 메서드만 CommerceException에 대해
    // 롤백하지 않도록 명시한다.
    @Transactional(noRollbackFor = CommerceException.class)
    public CheckoutSessionConfirmData confirmCheckoutSession(String userId, String checkoutSessionId,
                                                             CheckoutSessionConfirmRequest request) {
        CheckoutSession session = checkoutSessionRepository.findByCheckoutSessionIdAndUserId(checkoutSessionId, userId)
                .orElseThrow(() -> CommerceException.notFound("체크아웃 세션을 찾을 수 없습니다."));

        // 멱등 처리: 이미 같은 세션이 승인 완료됐다면(중복 콜백/네트워크 재시도) 다시 결제를 시도하지 않고
        // 기존 결과를 그대로 반환한다.
        if (session.getStatus() == CheckoutSession.Status.SUCCEEDED) {
            Subscription subscription = findOrCreateSubscription(userId);
            return new CheckoutSessionConfirmData(session.getCheckoutSessionId(), session.getPaymentId(),
                    "SUCCEEDED", session.getPlanId(), subscription.getStatus().name());
        }
        if (session.getStatus() != CheckoutSession.Status.PENDING) {
            throw CommerceException.conflict("CHECKOUT_SESSION_NOT_PENDING",
                    "이미 종료된 결제 세션입니다 (상태: " + session.getStatus() + ").");
        }

        Instant now = Instant.now();
        if (session.isExpired(now)) {
            session.markFailed("EXPIRED", now);
            checkoutSessionRepository.save(session);
            publishPaymentFailed(session, "CHECKOUT_SESSION_EXPIRED");
            throw CommerceException.conflict("CHECKOUT_SESSION_EXPIRED", "결제 세션이 만료되었습니다. 다시 시도해 주세요.");
        }

        // 클라이언트가 보낸 amount는 절대 신뢰하지 않고, 체크아웃 세션 생성 시 서버에 저장해 둔
        // 금액과 정확히 일치하는지 먼저 검증한다 (Toss confirm 호출 전 위변조 차단).
        if (request.getAmount() == null || request.getAmount() != session.getAmount()) {
            session.markFailed("AMOUNT_MISMATCH", now);
            checkoutSessionRepository.save(session);
            publishPaymentFailed(session, "AMOUNT_MISMATCH");
            throw CommerceException.paymentFailed("AMOUNT_MISMATCH", "결제 금액이 일치하지 않습니다.");
        }

        TossPaymentsClient.TossConfirmResult result = tossPaymentsClient.confirm(
                request.getPaymentKey(), checkoutSessionId, session.getAmount());

        if (!result.isApproved()) {
            session.markFailed(result.getErrorCode(), now);
            checkoutSessionRepository.save(session);
            publishPaymentFailed(session, result.getErrorCode());
            throw CommerceException.paymentFailed(result.getErrorCode(), result.getErrorMessage());
        }

        String paymentId = Ids.payment();
        session.markSucceeded(request.getPaymentKey(), paymentId, result.getPaymentMethod(), now);
        checkoutSessionRepository.save(session);

        Subscription subscription = findOrCreateSubscription(userId);
        Plan plan = plan(session.getPlanId());
        subscription.changePlan(plan.getPlanId(), Subscription.Status.ACTIVE, now);
        subscriptionRepository.save(subscription);

        eventPublisher.publish("PaymentSucceeded", userId, Map.of(
                "paymentId", paymentId,
                "userId", userId,
                "subscriptionId", subscription.getSubscriptionId(),
                "amount", session.getAmount(),
                "currency", session.getCurrency(),
                "provider", "toss"
        ));
        eventPublisher.publish("SubscriptionChanged", userId, Map.of(
                "subscriptionId", subscription.getSubscriptionId(),
                "userId", userId,
                "planId", plan.getPlanId(),
                "status", subscription.getStatus().name(),
                "effectiveAt", now.toString()
        ));

        log.info("결제 승인 완료: checkoutSessionId={}, paymentId={}, userId={}, planId={}",
                checkoutSessionId, paymentId, userId, plan.getPlanId());

        return new CheckoutSessionConfirmData(checkoutSessionId, paymentId, "SUCCEEDED",
                plan.getPlanId(), subscription.getStatus().name());
    }

    public PaymentRefundData refundPayment(String paymentId, BigDecimal amount, String reason) {
        CheckoutSession session = checkoutSessionRepository.findById(paymentId)
                .orElseThrow(() -> CommerceException.notFound("결제 내역을 찾을 수 없습니다: " + paymentId));

        if (session.getStatus() == CheckoutSession.Status.REFUNDED) {
            throw CommerceException.conflict("PAYMENT_ALREADY_REFUNDED", "이미 환불된 결제입니다.");
        }
        if (session.getStatus() != CheckoutSession.Status.SUCCEEDED) {
            throw CommerceException.conflict("PAYMENT_NOT_REFUNDABLE", "성공한 결제만 환불할 수 있습니다.");
        }
        if (session.getPaymentKey() == null || session.getPaymentKey().isBlank()) {
            throw CommerceException.conflict("PAYMENT_KEY_MISSING", "환불에 필요한 결제 키가 없습니다.");
        }

        BigDecimal refundableAmount = BigDecimal.valueOf(session.getAmount());
        if (amount != null && amount.compareTo(refundableAmount) != 0) {
            throw CommerceException.badRequest("REFUND_AMOUNT_MISMATCH", "현재 구현은 전액 환불만 지원합니다.");
        }

        Instant now = Instant.now();
        TossPaymentsClient.TossCancelResult result = tossPaymentsClient.cancel(session.getPaymentKey(), amount, reason);
        if (!result.isRefunded()) {
            throw CommerceException.paymentFailed(result.getErrorCode(), result.getErrorMessage());
        }

        String refundReason = reason == null || reason.isBlank() ? "관리자 요청 환불" : reason;
        session.markRefunded(refundReason, now);
        checkoutSessionRepository.save(session);

        Subscription subscription = findOrCreateSubscription(session.getUserId());
        subscription.cancelImmediately(PlanDataSeeder.FREE_PLAN_ID, now);
        subscriptionRepository.save(subscription);

        String refundId = "rfd_" + paymentId;
        eventPublisher.publish("PaymentRefunded", session.getUserId(), Map.of(
                "paymentId", paymentId,
                "refundId", refundId,
                "userId", session.getUserId(),
                "amount", session.getAmount(),
                "currency", session.getCurrency(),
                "provider", "toss",
                "refundedAt", now.toString()
        ));
        eventPublisher.publish("SubscriptionChanged", session.getUserId(), Map.of(
                "subscriptionId", subscription.getSubscriptionId(),
                "userId", session.getUserId(),
                "planId", subscription.getPlanId(),
                "status", subscription.getStatus().name(),
                "effectiveAt", now.toString()
        ));

        log.info("결제 환불 완료: paymentId={}, userId={}, amount={}", paymentId, session.getUserId(), session.getAmount());
        return new PaymentRefundData(paymentId, refundId, now);
    }

    public record PaymentRefundData(String paymentId, String refundId, Instant refundedAt) {}

    private void publishPaymentFailed(CheckoutSession session, String reasonCode) {
        eventPublisher.publish("PaymentFailed", session.getUserId(), Map.of(
                "paymentId", session.getCheckoutSessionId(),
                "userId", session.getUserId(),
                "reasonCode", reasonCode == null ? "UNKNOWN" : reasonCode,
                "provider", "toss"
        ));
    }

    // ── 구독 변경/취소 ────────────────────────────────────────────────

    public SubscriptionChangeData changeSubscription(String userId, SubscriptionChangeRequest request) {
        Plan targetPlan = plan(request.getTargetPlanId());
        Subscription subscription = findOrCreateSubscription(userId);
        Instant now = Instant.now();
        Subscription.Status status = targetPlan.getTier() == 0 ? Subscription.Status.FREE : Subscription.Status.ACTIVE;
        subscription.changePlan(targetPlan.getPlanId(), status, now);
        subscriptionRepository.save(subscription);

        eventPublisher.publish("SubscriptionChanged", userId, Map.of(
                "subscriptionId", subscription.getSubscriptionId(),
                "userId", userId,
                "planId", targetPlan.getPlanId(),
                "status", status.name(),
                "effectiveAt", now.toString()
        ));

        return new SubscriptionChangeData(targetPlan.getPlanId(), status.name(), now);
    }

    public SubscriptionCancelData cancelSubscription(String userId, SubscriptionCancelRequest request) {
        Subscription subscription = findOrCreateSubscription(userId);
        Instant now = Instant.now();

        if (Boolean.TRUE.equals(request.getCancelAtPeriodEnd())) {
            Instant cancelAt = subscription.getRenewalAt() != null ? subscription.getRenewalAt() : now;
            subscription.scheduleCancel(cancelAt, now);
            subscriptionRepository.save(subscription);
            eventPublisher.publish("SubscriptionChanged", userId, Map.of(
                    "subscriptionId", subscription.getSubscriptionId(),
                    "userId", userId,
                    "planId", subscription.getPlanId(),
                    "status", subscription.getStatus().name(),
                    "effectiveAt", now.toString()
            ));
            return new SubscriptionCancelData(subscription.getPlanId(), subscription.getStatus().name(), cancelAt);
        }

        subscription.cancelImmediately(PlanDataSeeder.FREE_PLAN_ID, now);
        subscriptionRepository.save(subscription);
        eventPublisher.publish("SubscriptionChanged", userId, Map.of(
                "subscriptionId", subscription.getSubscriptionId(),
                "userId", userId,
                "planId", subscription.getPlanId(),
                "status", subscription.getStatus().name(),
                "effectiveAt", now.toString()
        ));
        return new SubscriptionCancelData(subscription.getPlanId(), subscription.getStatus().name(), null);
    }

    // ── 헬퍼 ──────────────────────────────────────────────────────────

    private Subscription findOrCreateSubscription(String userId) {
        return subscriptionRepository.findById(userId).orElseGet(() -> {
            Subscription created = new Subscription(userId, Ids.subscription(), PlanDataSeeder.FREE_PLAN_ID,
                    Subscription.Status.FREE, Instant.now());
            return subscriptionRepository.save(created);
        });
    }

    private Plan plan(String planId) {
        return planRepository.findById(planId)
                .filter(Plan::isActive)
                .orElseThrow(() -> CommerceException.notFound("플랜을 찾을 수 없습니다: " + planId));
    }
}
