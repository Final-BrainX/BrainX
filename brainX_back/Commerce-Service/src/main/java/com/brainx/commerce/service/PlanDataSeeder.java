package com.brainx.commerce.service;

import com.brainx.commerce.entity.Plan;
import com.brainx.commerce.repository.PlanRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 플랜 시드 데이터. 가격은 등급 변경 동작 자체를 검증하기 위한 TEMP 테스트 값이다.
 * 실제 요금으로 전환할 때 PRO/MAX price를 정식 가격으로 되돌릴 것.
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
                List.of("노트 무제한", "AI 토큰 월 50,000", "기기 2대", "기본 검색"), 50_000L, true));

        // TEMP: 결제 플로우 테스트용 가격. 실제 요금(₩12,900 등)으로 전환 전 임시로 500원으로 둔다.
        planRepository.save(new Plan(PRO_PLAN_ID, "Pro", 500, "KRW", 1,
                List.of("AI 토큰 월 100만", "시맨틱 검색", "버전 기록 30일", "우선 처리"), 1_000_000L, true));

        // TEMP: 결제 플로우 테스트용 가격. 실제 요금(₩29,900 등)으로 전환 전 임시로 1000원으로 둔다.
        planRepository.save(new Plan(MAX_PLAN_ID, "Max", 1000, "KRW", 2,
                List.of("AI 토큰 무제한", "최신 모델 우선", "팀 공유", "우선 지원"), null, true));
    }
}
