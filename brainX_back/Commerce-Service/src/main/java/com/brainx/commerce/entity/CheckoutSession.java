package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * 결제 시도(주문) 1건. Toss Payments는 호스팅 체크아웃 페이지가 없으므로
 * 이 레코드의 checkoutSessionId를 Toss orderId로도 그대로 사용하고,
 * amount는 절대 클라이언트 입력을 신뢰하지 않고 Plan 가격을 그대로 저장해
 * confirm 시점에 위변조 여부를 대조하는 기준으로 쓴다.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_checkout_sessions", indexes = @Index(name = "idx_checkout_user", columnList = "userId"))
public class CheckoutSession {
    public enum Status {
        PENDING, SUCCEEDED, FAILED, REFUNDED, CANCELLED, EXPIRED
    }

    public enum Provider {
        TOSS, STRIPE
    }

    @Id
    private String checkoutSessionId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String planId;
    @Column(nullable = false)
    private long amount;
    @Column(nullable = false)
    private String currency;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Provider provider;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;
    private String paymentKey;
    private String paymentId;
    @Column(length = 80)
    private String paymentMethod;
    private String failureReason;
    @Column(nullable = false)
    private Instant createdAt;
    private Instant confirmedAt;
    @Column(nullable = false)
    private Instant expiresAt;

    public CheckoutSession(String checkoutSessionId, String userId, String planId, long amount, String currency,
                           Provider provider, Instant now, Instant expiresAt) {
        this.checkoutSessionId = checkoutSessionId;
        this.userId = userId;
        this.planId = planId;
        this.amount = amount;
        this.currency = currency;
        this.provider = provider;
        this.status = Status.PENDING;
        this.createdAt = now;
        this.expiresAt = expiresAt;
    }

    public boolean isExpired(Instant now) {
        return now.isAfter(expiresAt);
    }

    public void markSucceeded(String paymentKey, String paymentId, String paymentMethod, Instant now) {
        this.status = Status.SUCCEEDED;
        this.paymentKey = paymentKey;
        this.paymentId = paymentId;
        this.paymentMethod = paymentMethod;
        this.confirmedAt = now;
    }

    public void markFailed(String reason, Instant now) {
        this.status = Status.FAILED;
        this.failureReason = reason;
        this.confirmedAt = now;
    }

    public void markRefunded(String reason, Instant now) {
        this.status = Status.REFUNDED;
        this.failureReason = reason;
        this.confirmedAt = now;
    }
}
