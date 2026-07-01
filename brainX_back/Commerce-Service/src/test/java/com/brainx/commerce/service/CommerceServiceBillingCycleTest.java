package com.brainx.commerce.service;

import com.brainx.commerce.client.TossPaymentsClient;
import com.brainx.commerce.dto.CommerceDtos.CheckoutSessionConfirmRequest;
import com.brainx.commerce.dto.CommerceDtos.CheckoutSessionCreateRequest;
import com.brainx.commerce.entity.CheckoutSession;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.event.CommerceEventPublisher;
import com.brainx.commerce.repository.CheckoutSessionRepository;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

@ExtendWith(MockitoExtension.class)
class CommerceServiceBillingCycleTest {

    @Mock
    private PlanRepository planRepository;

    @Mock
    private SubscriptionRepository subscriptionRepository;

    @Mock
    private CheckoutSessionRepository checkoutSessionRepository;

    @Mock
    private CommerceEventPublisher eventPublisher;

    @Mock
    private TossPaymentsClient tossPaymentsClient;

    private CommerceService commerceService;

    @BeforeEach
    void setUp() {
        commerceService = new CommerceService(
                planRepository,
                subscriptionRepository,
                checkoutSessionRepository,
                eventPublisher,
                tossPaymentsClient
        );
        ReflectionTestUtils.setField(commerceService, "tossClientKey", "test-client-key");
    }

    @Test
    void createCheckoutSessionAppliesYearlyDiscountAndStoresBillingCycle() {
        Plan yearlyPlan = new Plan("pro", "Pro", 10000L, "KRW", 2, List.of("A", "B"), true);
        when(planRepository.findById("pro")).thenReturn(Optional.of(yearlyPlan));
        when(checkoutSessionRepository.save(any(CheckoutSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CheckoutSessionCreateRequest request = new CheckoutSessionCreateRequest();
        ReflectionTestUtils.setField(request, "planId", "pro");
        ReflectionTestUtils.setField(request, "successUrl", "https://brainx.local/success");
        ReflectionTestUtils.setField(request, "cancelUrl", "https://brainx.local/cancel");
        ReflectionTestUtils.setField(request, "billingCycle", CheckoutSession.BillingCycle.YEARLY);

        var data = commerceService.createCheckoutSession("usr_1", request);

        Assertions.assertThat(data.amount()).isEqualTo(8000L);
        Assertions.assertThat(data.clientKey()).isEqualTo("test-client-key");

        ArgumentCaptor<CheckoutSession> sessionCaptor = ArgumentCaptor.forClass(CheckoutSession.class);
        org.mockito.Mockito.verify(checkoutSessionRepository).save(sessionCaptor.capture());
        Assertions.assertThat(sessionCaptor.getValue().getBillingCycle()).isEqualTo(CheckoutSession.BillingCycle.YEARLY);
    }

    @Test
    void confirmCheckoutSessionUsesThirtyDaysForMonthlyCycle() {
        assertRenewalWindow(CheckoutSession.BillingCycle.MONTHLY, 30);
    }

    @Test
    void confirmCheckoutSessionUsesThreeHundredSixtyFiveDaysForYearlyCycle() {
        assertRenewalWindow(CheckoutSession.BillingCycle.YEARLY, 365);
    }

    private void assertRenewalWindow(CheckoutSession.BillingCycle billingCycle, int days) {
        Plan plan = new Plan("pro", "Pro", 10000L, "KRW", 2, List.of("A", "B"), true);
        when(planRepository.findById("pro")).thenReturn(Optional.of(plan));
        when(subscriptionRepository.findById("usr_1")).thenReturn(Optional.empty());
        when(subscriptionRepository.save(any(Subscription.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Instant now = Instant.now();
        CheckoutSession session = new CheckoutSession(
                "chs_1",
                "usr_1",
                "pro",
                10000L,
                "KRW",
                CheckoutSession.Provider.TOSS,
                billingCycle,
                now,
                now.plusSeconds(3600)
        );
        when(checkoutSessionRepository.findByCheckoutSessionIdAndUserId("chs_1", "usr_1"))
                .thenReturn(Optional.of(session));
        when(tossPaymentsClient.confirm("pk_1", "chs_1", 10000L))
                .thenReturn(new TossPaymentsClient.TossConfirmResult(true, "DONE", "카드", null, null));

        CheckoutSessionConfirmRequest request = new CheckoutSessionConfirmRequest();
        ReflectionTestUtils.setField(request, "paymentKey", "pk_1");
        ReflectionTestUtils.setField(request, "orderId", "chs_1");
        ReflectionTestUtils.setField(request, "amount", 10000L);

        Instant before = Instant.now();
        var result = commerceService.confirmCheckoutSession("usr_1", "chs_1", request);
        Instant after = Instant.now();

        Assertions.assertThat(result.status()).isEqualTo("SUCCEEDED");

        ArgumentCaptor<Subscription> subscriptionCaptor = ArgumentCaptor.forClass(Subscription.class);
        org.mockito.Mockito.verify(subscriptionRepository, times(2)).save(subscriptionCaptor.capture());
        Subscription saved = subscriptionCaptor.getAllValues().get(1);
        Assertions.assertThat(saved.getBillingCycle()).isEqualTo(
                billingCycle == CheckoutSession.BillingCycle.YEARLY ? Subscription.BillingCycle.YEARLY : Subscription.BillingCycle.MONTHLY
        );
        Assertions.assertThat(saved.getRenewalAt()).isNotNull();
        Assertions.assertThat(saved.getRenewalAt()).isAfterOrEqualTo(before.plusSeconds(days * 86400L - 10));
        Assertions.assertThat(saved.getRenewalAt()).isBeforeOrEqualTo(after.plusSeconds(days * 86400L + 10));
    }
}
