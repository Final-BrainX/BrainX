package com.brainx.commerce.dto;

import com.brainx.commerce.entity.CheckoutSession;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class CommerceDtos {

    @Getter
    public static class PlanItem {
        private final String planId;
        private final String name;
        private final long price;
        private final String currency;
        private final List<String> features;
        private final Map<String, Object> entitlements;

        public PlanItem(Plan plan) {
            this.planId = plan.getPlanId();
            this.name = plan.getName();
            this.price = plan.getPrice();
            this.currency = plan.getCurrency();
            // features는 지연 로딩 컬렉션이라 트랜잭션 안에서 복사해 둬야 세션이 닫힌 뒤
            // 직렬화할 때 LazyInitializationException이 나지 않는다.
            this.features = new ArrayList<>(plan.getFeatures());
            this.entitlements = Map.of("tier", plan.getTier());
        }
    }

    public record PlansData(List<PlanItem> plans) {
        public static PlansData from(List<Plan> plans) {
            return new PlansData(plans.stream().map(PlanItem::new).toList());
        }
    }

    public record PlanRef(String planId, String name) {
    }

    public record SubscriptionData(
            PlanRef plan,
            String status,
            Instant startedAt,
            Instant renewalAt,
            String billingCycle,
            Map<String, Object> entitlements
    ) {
        public static SubscriptionData of(Subscription subscription, Plan plan) {
            return new SubscriptionData(
                    new PlanRef(plan.getPlanId(), plan.getName()),
                    subscription.getStatus().name(),
                    subscription.getCreatedAt(),
                    subscription.getRenewalAt(),
                    subscription.getBillingCycle().name(),
                    Map.of("tier", plan.getTier())
            );
        }
    }

    @Getter
    @NoArgsConstructor
    public static class CheckoutSessionCreateRequest {
        @NotBlank
        private String planId;
        @NotBlank
        private String successUrl;
        @NotBlank
        private String cancelUrl;
        @NotNull
        private CheckoutSession.BillingCycle billingCycle;
    }

    public record CheckoutSessionData(
            String checkoutSessionId,
            String provider,
            String checkoutUrl,
            String clientKey,
            String orderId,
            String orderName,
            Long amount,
            String currency
    ) {
        public static CheckoutSessionData forToss(CheckoutSession session, String clientKey, String orderName) {
            return new CheckoutSessionData(
                    session.getCheckoutSessionId(),
                    "toss",
                    null,
                    clientKey,
                    session.getCheckoutSessionId(),
                    orderName,
                    session.getAmount(),
                    session.getCurrency()
            );
        }
    }

    @Getter
    @NoArgsConstructor
    public static class CheckoutSessionConfirmRequest {
        @NotBlank
        private String paymentKey;
        @NotBlank
        private String orderId;
        @NotNull
        @Positive
        private Long amount;
    }

    public record CheckoutSessionConfirmData(
            String checkoutSessionId,
            String paymentId,
            String status,
            String planId,
            String subscriptionStatus
    ) {
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class SubscriptionChangeRequest {
        @NotBlank
        private String targetPlanId;
    }

    public record SubscriptionChangeData(String planId, String status, Instant changedAt) {
    }

    @Getter
    @NoArgsConstructor
    public static class SubscriptionCancelRequest {
        @NotNull
        private Boolean cancelAtPeriodEnd;
    }

    public record SubscriptionCancelData(String planId, String status, Instant cancelAt) {
    }

    public record TokenUsageData(
            String planName,
            Long monthlyCreditLimit,
            long usedCredits,
            double usagePercent,
            String resetDate,
            List<FeatureUsage> byFeature,
            List<DailyUsage> recentDays
    ) {
    }

    public record FeatureUsage(String feature, long credits) {
    }

    public record DailyUsage(String date, long credits) {
    }

    public record EntitlementsCheckRequest(
            String userId,
            String guestId,
            String capability,
            Integer quantity
    ) {
    }

    public record EntitlementsCheckData(
            boolean allowed,
            String reason,
            Integer remaining,
            int entitlementSnapshotVersion
    ) {
    }

    public record AiUsageData(
            String actorType,
            long usedCount,
            Integer limit,
            Integer remaining,
            Double usagePercent
    ) {
    }
}
