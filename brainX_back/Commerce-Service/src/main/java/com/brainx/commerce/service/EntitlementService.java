package com.brainx.commerce.service;

import com.brainx.commerce.dto.CommerceDtos.EntitlementsCheckData;
import com.brainx.commerce.entity.GuestAiUsage;
import com.brainx.commerce.repository.GuestAiUsageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;

/**
 * AI 기능 호출 전 preflight 판정. capability 종류와 무관하게 actor(회원/게스트) 하나당
 * 하나의 한도 풀만 본다 — 회원은 이번 달 크레딧 잔여량, 게스트는 총 호출 횟수(10회).
 * actorId가 Gateway가 발급한 게스트 id 형식(gst_...)이면 게스트로 판정한다.
 */
@Service
@RequiredArgsConstructor
public class EntitlementService {

    public static final int GUEST_AI_CALL_LIMIT = 10;
    private static final String GUEST_ID_PREFIX = "gst_";
    private static final int ENTITLEMENT_SNAPSHOT_VERSION = 1;

    private final GuestAiUsageRepository guestAiUsageRepository;
    private final TokenUsageService tokenUsageService;

    @Transactional(readOnly = true)
    public long guestUsedCount(String guestId) {
        return guestAiUsageRepository.findById(guestId).map(GuestAiUsage::getUsedCount).orElse(0);
    }

    @Transactional
    public EntitlementsCheckData checkAndConsume(String userId, String guestId) {
        String effectiveGuestId = resolveGuestId(userId, guestId);
        if (effectiveGuestId != null) {
            return checkGuest(effectiveGuestId);
        }
        return checkMember(userId);
    }

    private String resolveGuestId(String userId, String guestId) {
        if (guestId != null && !guestId.isBlank()) {
            return guestId;
        }
        if (userId != null && userId.startsWith(GUEST_ID_PREFIX)) {
            return userId;
        }
        return null;
    }

    private EntitlementsCheckData checkGuest(String guestId) {
        int affected = guestAiUsageRepository.incrementIfUnderLimit(guestId, GUEST_AI_CALL_LIMIT);
        boolean allowed = affected > 0;
        long usedCount = guestAiUsageRepository.findById(guestId).map(GuestAiUsage::getUsedCount).orElse(0);
        int remaining = (int) Math.max(0, GUEST_AI_CALL_LIMIT - usedCount);
        String reason = allowed ? null : "GUEST_AI_CALL_LIMIT_EXCEEDED";
        return new EntitlementsCheckData(allowed, reason, remaining, ENTITLEMENT_SNAPSHOT_VERSION);
    }

    private EntitlementsCheckData checkMember(String userId) {
        String yearMonth = YearMonth.now().toString();
        Long remainingQuota = tokenUsageService.calculateRemainingQuota(userId, yearMonth);
        boolean allowed = remainingQuota == null || remainingQuota > 0;
        String reason = allowed ? null : "MONTHLY_CREDIT_LIMIT_EXCEEDED";
        Integer remaining = remainingQuota != null ? remainingQuota.intValue() : null;
        return new EntitlementsCheckData(allowed, reason, remaining, ENTITLEMENT_SNAPSHOT_VERSION);
    }
}
