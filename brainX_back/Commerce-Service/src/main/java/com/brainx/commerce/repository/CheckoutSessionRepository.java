package com.brainx.commerce.repository;

import com.brainx.commerce.entity.CheckoutSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CheckoutSessionRepository extends JpaRepository<CheckoutSession, String> {
    Optional<CheckoutSession> findByCheckoutSessionIdAndUserId(String checkoutSessionId, String userId);
    Optional<CheckoutSession> findByPaymentId(String paymentId);

    List<CheckoutSession> findByStatusOrderByConfirmedAtDesc(CheckoutSession.Status status);

    List<CheckoutSession> findAllByOrderByCreatedAtDesc();
}
