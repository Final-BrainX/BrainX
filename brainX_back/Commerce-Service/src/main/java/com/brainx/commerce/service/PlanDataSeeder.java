package com.brainx.commerce.service;

import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.repository.PlanRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 플랜 시드 데이터.
 * 한도는 토큰 개수가 아니라 크레딧(= Intelligence-Service가 계산한 estimatedCost(USD)를
 * CreditConverter로 환산한 원가, 100크레딧 = 1원 상당)이다. 모델별 단가가 달라
 * 토큰 개수로는 실제 원가를 대표하지 못하므로, 구독가 대비 AI 원가 비중을 25~30%대로 맞춘
 * 크레딧 예산으로 한도를 정의한다.
 */
@Component
@RequiredArgsConstructor
public class PlanDataSeeder {
    public static final String FREE_PLAN_ID = "free";
    public static final String PRO_PLAN_ID = "pro";
    public static final String MAX_PLAN_ID = "max";

    private final PlanRepository planRepository;

    @PostConstruct
    public void seed() {
        if (planRepository.count() > 0) {
            return;
        }

        planRepository.save(new Plan(FREE_PLAN_ID, "무료", 0, "KRW", 0,
                List.of("노트 무제한", "AI 크레딧 월 20,000", "기기 2대", "기본 검색"), 20_000L, true));

        planRepository.save(new Plan(PRO_PLAN_ID, "Pro", 24_000, "KRW", 1,
                List.of("AI 크레딧 월 600,000", "시맨틱 검색", "버전 기록 30일", "우선 처리"), 600_000L, true));

        planRepository.save(new Plan(MAX_PLAN_ID, "Max", 80_000, "KRW", 2,
                List.of("AI 크레딧 월 2,000,000", "최신 모델 우선", "팀 공유", "우선 지원"), 2_000_000L, true));
    }
}
