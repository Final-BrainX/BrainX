package com.brainx.commerce.service;

import com.brainx.commerce.dto.CommerceDtos.DailyUsage;
import com.brainx.commerce.dto.CommerceDtos.FeatureUsage;
import com.brainx.commerce.dto.CommerceDtos.TokenUsageData;
import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.entity.Subscription;
import com.brainx.commerce.entity.TokenUsageMonthly;
import com.brainx.commerce.entity.TokenUsageRaw;
import com.brainx.commerce.event.CommerceEventPublisher;
import com.brainx.commerce.event.consumer.TokenUsageEventListener.Payload;
import com.brainx.commerce.repository.PlanRepository;
import com.brainx.commerce.repository.SubscriptionRepository;
import com.brainx.commerce.repository.TokenUsageDailyRepository;
import com.brainx.commerce.repository.TokenUsageMonthlyRepository;
import com.brainx.commerce.repository.TokenUsageRawRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TokenUsageService {

    private final TokenUsageRawRepository rawRepository;
    private final TokenUsageDailyRepository dailyRepository;
    private final TokenUsageMonthlyRepository monthlyRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PlanRepository planRepository;
    private final CommerceEventPublisher eventPublisher;

    public void ingest(String eventId, Instant occurredAt, Payload payload) {
        if (rawRepository.existsById(eventId)) {
            log.info("Duplicate TokenUsageRecordedRequested skipped: eventId={}", eventId);
            return;
        }

        Instant recordedAt = occurredAt != null ? occurredAt : Instant.now();
        BigDecimal cost = payload.estimatedCost() != null ? payload.estimatedCost() : BigDecimal.ZERO;

        rawRepository.save(new TokenUsageRaw(
                eventId, payload.usageRequestId(), payload.userId(), payload.sourceService(), payload.featureId(),
                payload.modelId(), payload.inputTokens(), payload.cachedInputTokens(), payload.billableInputTokens(),
                payload.outputTokens(), payload.reasoningTokens(), payload.totalTokens(), payload.estimatedCost(),
                payload.costCurrency(), recordedAt, Instant.now()
        ));

        LocalDate usageDate = recordedAt.atZone(ZoneOffset.UTC).toLocalDate();
        String yearMonth = YearMonth.from(usageDate).toString();

        dailyRepository.upsert(payload.userId(), usageDate, payload.featureId(), payload.totalTokens(), cost);
        monthlyRepository.upsert(payload.userId(), yearMonth, payload.featureId(), payload.totalTokens(), cost);

        Long remainingQuota = calculateRemainingQuota(payload.userId(), yearMonth);

        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("ledgerId", eventId);
        eventPayload.put("usageRequestId", payload.usageRequestId());
        eventPayload.put("userId", payload.userId());
        eventPayload.put("remainingQuota", remainingQuota);
        eventPayload.put("cost", payload.estimatedCost());
        eventPublisher.publish("TokenUsageRecorded", payload.userId(), eventPayload);
    }

    @Transactional(readOnly = true)
    public TokenUsageData getMyTokenUsage(String userId, YearMonth month) {
        Plan plan = resolvePlan(userId);
        String planName = plan != null ? plan.getName() : null;
        Long monthlyLimit = plan != null ? plan.getMonthlyTokenLimit() : null;

        String yearMonthKey = month.toString();
        List<TokenUsageMonthly> monthlyRows = monthlyRepository.findByIdUserIdAndIdYearMonth(userId, yearMonthKey);

        long usedTokens = monthlyRows.stream().mapToLong(TokenUsageMonthly::getTotalTokens).sum();
        double usagePercent = (monthlyLimit != null && monthlyLimit > 0)
                ? (usedTokens * 100.0) / monthlyLimit
                : 0.0;

        Map<String, Long> tokensByLabel = new HashMap<>();
        for (TokenUsageMonthly row : monthlyRows) {
            String label = TokenUsageFeatureLabels.labelFor(row.getId().getFeatureId());
            tokensByLabel.merge(label, row.getTotalTokens(), Long::sum);
        }
        List<FeatureUsage> byFeature = tokensByLabel.entrySet().stream()
                .map(entry -> new FeatureUsage(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparingLong(FeatureUsage::tokens).reversed())
                .toList();

        String resetDate = month.plusMonths(1).atDay(1).toString();
        List<DailyUsage> recentDays = recentDailyUsage(userId);

        return new TokenUsageData(planName, monthlyLimit, usedTokens, usagePercent, resetDate, byFeature, recentDays);
    }

    private Long calculateRemainingQuota(String userId, String yearMonth) {
        long monthlyUsed = monthlyRepository.findByIdUserIdAndIdYearMonth(userId, yearMonth).stream()
                .mapToLong(TokenUsageMonthly::getTotalTokens)
                .sum();
        Plan plan = resolvePlan(userId);
        Long monthlyLimit = plan != null ? plan.getMonthlyTokenLimit() : null;
        return monthlyLimit != null ? Math.max(0, monthlyLimit - monthlyUsed) : null;
    }

    // 아직 구독 레코드가 없는 신규 사용자를 무제한으로 잘못 표시하지 않도록 기본 Free 플랜으로 취급한다.
    private Plan resolvePlan(String userId) {
        String planId = subscriptionRepository.findById(userId)
                .map(Subscription::getPlanId)
                .orElse(PlanDataSeeder.FREE_PLAN_ID);
        return planRepository.findById(planId).orElse(null);
    }

    private List<DailyUsage> recentDailyUsage(String userId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate sevenDaysAgo = today.minusDays(6);
        Map<LocalDate, Long> dailyTotals = dailyRepository.sumByUserAndDateRange(userId, sevenDaysAgo, today).stream()
                .collect(Collectors.toMap(
                        TokenUsageDailyRepository.DailyTotal::getUsageDate,
                        TokenUsageDailyRepository.DailyTotal::getTotalTokens));

        List<DailyUsage> recentDays = new ArrayList<>();
        for (LocalDate date = sevenDaysAgo; !date.isAfter(today); date = date.plusDays(1)) {
            recentDays.add(new DailyUsage(date.toString(), dailyTotals.getOrDefault(date, 0L)));
        }
        return recentDays;
    }
}
