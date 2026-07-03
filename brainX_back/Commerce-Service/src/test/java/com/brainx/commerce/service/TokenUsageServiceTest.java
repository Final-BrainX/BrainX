package com.brainx.commerce.service;

import com.brainx.commerce.dto.CommerceDtos.DailyUsage;
import com.brainx.commerce.dto.CommerceDtos.FeatureUsage;
import com.brainx.commerce.dto.CommerceDtos.TokenUsageData;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.entity.TokenUsageMonthly;
import com.brainx.commerce.entity.TokenUsageMonthlyId;
import com.brainx.commerce.entity.TokenUsageRaw;
import com.brainx.commerce.event.CommerceEventPublisher;
import com.brainx.commerce.event.consumer.TokenUsageEventListener.Payload;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import com.brainx.commerce.repository.TokenUsageDailyRepository;
import com.brainx.commerce.repository.TokenUsageMonthlyRepository;
import com.brainx.commerce.repository.TokenUsageRawRepository;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TokenUsageServiceTest {

    @Mock
    private TokenUsageRawRepository rawRepository;
    @Mock
    private TokenUsageDailyRepository dailyRepository;
    @Mock
    private TokenUsageMonthlyRepository monthlyRepository;
    @Mock
    private SubscriptionRepository subscriptionRepository;
    @Mock
    private PlanRepository planRepository;
    @Mock
    private CommerceEventPublisher eventPublisher;

    private TokenUsageService tokenUsageService() {
        return new TokenUsageService(rawRepository, dailyRepository, monthlyRepository,
                subscriptionRepository, planRepository, eventPublisher);
    }

    private Payload samplePayload() {
        return new Payload("req_1", "usr_1", "Intelligence-Service", "rag-chat", "gpt-5",
                100, 10, 90, 50, 0, 150,
                null, null, null, new BigDecimal("0.001200"), "USD", "cause_1");
    }

    @Test
    void ingestSkipsAlreadyProcessedEvent() {
        when(rawRepository.existsById("evt_1")).thenReturn(true);

        tokenUsageService().ingest("evt_1", Instant.now(), samplePayload());

        verify(rawRepository, never()).save(any(TokenUsageRaw.class));
        verifyNoInteractions(dailyRepository, monthlyRepository, eventPublisher);
    }

    @Test
    void ingestAccumulatesUsageAndPublishesTokenUsageRecordedWithRemainingQuota() {
        when(rawRepository.existsById("evt_1")).thenReturn(false);
        when(subscriptionRepository.findById("usr_1"))
                .thenReturn(Optional.of(new Subscription("usr_1", "sub_1", "pro", Subscription.Status.ACTIVE, Instant.now())));
        when(planRepository.findById("pro"))
                .thenReturn(Optional.of(new Plan("pro", "Pro", 500, "KRW", 1, List.of(), 1_000_000L, true)));
        String yearMonth = YearMonth.now().toString();
        when(monthlyRepository.findByIdUserIdAndIdYearMonth("usr_1", yearMonth)).thenReturn(List.of(
                new TokenUsageMonthly(new TokenUsageMonthlyId("usr_1", yearMonth, "rag-chat"), 150L, new BigDecimal("0.0012"), Instant.now())
        ));

        tokenUsageService().ingest("evt_1", Instant.now(), samplePayload());

        verify(rawRepository).save(any(TokenUsageRaw.class));
        verify(dailyRepository).upsert(eq("usr_1"), any(LocalDate.class), eq("rag-chat"), eq(150L), any(BigDecimal.class));
        verify(monthlyRepository).upsert(eq("usr_1"), eq(yearMonth), eq("rag-chat"), eq(150L), any(BigDecimal.class));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(eventPublisher).publish(eq("TokenUsageRecorded"), eq("usr_1"), payloadCaptor.capture());
        Map<String, Object> published = payloadCaptor.getValue();
        Assertions.assertThat(published.get("ledgerId")).isEqualTo("evt_1");
        Assertions.assertThat(published.get("usageRequestId")).isEqualTo("req_1");
        // 0.0012 USD * 1600 KRW/USD * 100 크레딧/원 = 192 크레딧
        Assertions.assertThat(published.get("remainingQuota")).isEqualTo(999_808L);
    }

    @Test
    void ingestPublishesNullRemainingQuotaForUnlimitedPlan() {
        when(rawRepository.existsById("evt_1")).thenReturn(false);
        when(subscriptionRepository.findById("usr_1"))
                .thenReturn(Optional.of(new Subscription("usr_1", "sub_1", "max", Subscription.Status.ACTIVE, Instant.now())));
        when(planRepository.findById("max"))
                .thenReturn(Optional.of(new Plan("max", "Max", 1000, "KRW", 2, List.of(), null, true)));
        when(monthlyRepository.findByIdUserIdAndIdYearMonth(any(), any())).thenReturn(List.of());

        tokenUsageService().ingest("evt_1", Instant.now(), samplePayload());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(eventPublisher).publish(eq("TokenUsageRecorded"), eq("usr_1"), payloadCaptor.capture());
        Assertions.assertThat(payloadCaptor.getValue().get("remainingQuota")).isNull();
    }

    @Test
    void getMyTokenUsageGroupsByFeatureLabelSortedDescendingAndComputesPercent() {
        YearMonth month = YearMonth.of(2026, 7);
        when(subscriptionRepository.findById("usr_1"))
                .thenReturn(Optional.of(new Subscription("usr_1", "sub_1", "pro", Subscription.Status.ACTIVE, Instant.now())));
        when(planRepository.findById("pro"))
                .thenReturn(Optional.of(new Plan("pro", "Pro", 500, "KRW", 1, List.of(), 1_000_000L, true)));
        when(monthlyRepository.findByIdUserIdAndIdYearMonth("usr_1", "2026-07")).thenReturn(List.of(
                new TokenUsageMonthly(new TokenUsageMonthlyId("usr_1", "2026-07", "rag-chat"), 30_000L, new BigDecimal("1.00"), Instant.now()),
                new TokenUsageMonthly(new TokenUsageMonthlyId("usr_1", "2026-07", "note-search-index-embedding"), 20_000L, new BigDecimal("0.25"), Instant.now()),
                new TokenUsageMonthly(new TokenUsageMonthlyId("usr_1", "2026-07", "inline-assist-chat"), 100_000L, new BigDecimal("3.00"), Instant.now())
        ));
        when(dailyRepository.sumByUserAndDateRange(any(), any(), any())).thenReturn(List.of());

        TokenUsageData data = tokenUsageService().getMyTokenUsage("usr_1", month);

        // 크레딧 = estimatedCost(USD) * 1600 * 100. inline-assist 3.00->480,000, rag-chat 1.00->160,000, embedding 0.25->40,000
        Assertions.assertThat(data.planName()).isEqualTo("Pro");
        Assertions.assertThat(data.monthlyCreditLimit()).isEqualTo(1_000_000L);
        Assertions.assertThat(data.usedCredits()).isEqualTo(680_000L);
        Assertions.assertThat(data.usagePercent()).isEqualTo(68.0);
        Assertions.assertThat(data.resetDate()).isEqualTo("2026-08-01");
        Assertions.assertThat(data.byFeature()).extracting(FeatureUsage::feature)
                .containsExactly("AI 글쓰기 도우미", "AI 챗봇", "시맨틱 검색");
        Assertions.assertThat(data.byFeature()).extracting(FeatureUsage::credits)
                .containsExactly(480_000L, 160_000L, 40_000L);
        Assertions.assertThat(data.recentDays()).hasSize(7);
        Assertions.assertThat(data.recentDays()).allSatisfy(d -> Assertions.assertThat(d.credits()).isEqualTo(0L));
    }

    @Test
    void getMyTokenUsageFillsMissingDaysWithZeroAndKeepsKnownTotals() {
        YearMonth month = YearMonth.now();
        when(subscriptionRepository.findById("usr_1")).thenReturn(Optional.empty());
        when(monthlyRepository.findByIdUserIdAndIdYearMonth(any(), any())).thenReturn(List.of());
        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);
        when(dailyRepository.sumByUserAndDateRange(eq("usr_1"), any(), any())).thenReturn(List.of(
                dailyTotal(today, new BigDecimal("0.03"))
        ));

        TokenUsageData data = tokenUsageService().getMyTokenUsage("usr_1", month);

        Assertions.assertThat(data.planName()).isNull();
        Assertions.assertThat(data.monthlyCreditLimit()).isNull();
        Assertions.assertThat(data.usagePercent()).isEqualTo(0.0);
        List<DailyUsage> days = data.recentDays();
        Assertions.assertThat(days).hasSize(7);
        Assertions.assertThat(days.get(days.size() - 1).date()).isEqualTo(today.toString());
        // 0.03 USD * 1600 * 100 = 4,800 크레딧
        Assertions.assertThat(days.get(days.size() - 1).credits()).isEqualTo(4_800L);
    }

    private TokenUsageDailyRepository.DailyTotal dailyTotal(LocalDate date, BigDecimal estimatedCost) {
        return new TokenUsageDailyRepository.DailyTotal() {
            @Override
            public LocalDate getUsageDate() {
                return date;
            }

            @Override
            public long getTotalTokens() {
                return 0L;
            }

            @Override
            public BigDecimal getEstimatedCost() {
                return estimatedCost;
            }
        };
    }
}
