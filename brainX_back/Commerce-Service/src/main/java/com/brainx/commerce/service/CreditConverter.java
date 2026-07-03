package com.brainx.commerce.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Intelligence-Service가 계산한 모델별 estimatedCost(USD)를 크레딧(100크레딧 = 1원 상당)으로
 * 환산한다. 모델마다 토큰당 단가가 달라 토큰 개수만으로는 실제 원가를 대표하지 못하므로,
 * 한도·사용량 표시는 전부 이 크레딧 단위를 기준으로 한다. 1크레딧 단위로는 저가 이벤트(임베딩 등)가
 * 반올림으로 0에 묻히기 쉬워, 원 단위보다 100배 세분화해 작은 사용량도 구분되게 한다.
 *
 * 환율은 실시간 연동이 아니라 고정 상수다 — 실제 환율과 크게 벌어지면 조정 필요.
 */
final class CreditConverter {
    private static final BigDecimal USD_TO_KRW_RATE = BigDecimal.valueOf(1600);
    private static final BigDecimal CREDITS_PER_WON = BigDecimal.valueOf(100);

    private CreditConverter() {
    }

    static long toCredits(BigDecimal estimatedCostUsd) {
        if (estimatedCostUsd == null) {
            return 0L;
        }
        return estimatedCostUsd.multiply(USD_TO_KRW_RATE)
                .multiply(CREDITS_PER_WON)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }
}
