package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_subscriptions")
public class Subscription {
    public enum Status {
        FREE, ACTIVE, PAST_DUE, CANCEL_SCHEDULED, CANCELLED
    }

    public enum BillingCycle {
        MONTHLY, YEARLY
    }

    @Id
    private String userId;
    @Column(nullable = false)
    private String subscriptionId;
    @Column(nullable = false)
    private String planId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BillingCycle billingCycle;
    private Instant renewalAt;
    private Instant cancelAt;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    public Subscription(String userId, String subscriptionId, String planId, Status status, Instant now) {
        this.userId = userId;
        this.subscriptionId = subscriptionId;
        this.planId = planId;
        this.status = status;
        this.billingCycle = BillingCycle.MONTHLY;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void changePlan(String planId, Status status, BillingCycle billingCycle, Instant renewalAt, Instant now) {
        this.planId = planId;
        this.status = status;
        this.billingCycle = billingCycle;
        this.renewalAt = renewalAt;
        this.cancelAt = null;
        this.updatedAt = now;
    }

    public void scheduleCancel(Instant cancelAt, Instant now) {
        this.status = Status.CANCEL_SCHEDULED;
        this.cancelAt = cancelAt;
        this.updatedAt = now;
    }

    public void cancelImmediately(String freePlanId, Instant now) {
        this.planId = freePlanId;
        this.status = Status.FREE;
        this.billingCycle = BillingCycle.MONTHLY;
        this.cancelAt = null;
        this.renewalAt = null;
        this.updatedAt = now;
    }
}
