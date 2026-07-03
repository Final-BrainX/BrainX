package com.brainx.commerce.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 플랜 정의 (FREE/PRO/MAX). tier는 등급 비교용 정수 — 숫자가 클수록 상위 등급이다.
 * 등급별 기능 제한(entitlement gating)은 이번 단계에서는 보류하고, 결제 성공 시
 * 구독의 planId/tier만 정확히 갈아끼우는 것까지를 범위로 한다.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_plans")
public class Plan {
    @Id
    private String planId;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private long price;
    @Column(nullable = false)
    private String currency;
    @Column(nullable = false)
    private int tier;
    @ElementCollection
    @CollectionTable(name = "commerce_plan_features", joinColumns = @JoinColumn(name = "plan_id"))
    @Column(name = "feature")
    private List<String> features = new ArrayList<>();
    @Column(nullable = false)
    private boolean active;
    @Column(name = "monthly_credit_limit")
    private Long monthlyCreditLimit;

    public Plan(String planId, String name, long price, String currency, int tier, List<String> features,
                Long monthlyCreditLimit, boolean active) {
        this.planId = planId;
        this.name = name;
        this.price = price;
        this.currency = currency;
        this.tier = tier;
        this.features = features == null ? new ArrayList<>() : new ArrayList<>(features);
        this.monthlyCreditLimit = monthlyCreditLimit;
        this.active = active;
    }

    public void updatePlanPrice(long price, String currency) {
        this.price = price;
        if (currency != null) {
            this.currency = currency;
        }
    }
}
