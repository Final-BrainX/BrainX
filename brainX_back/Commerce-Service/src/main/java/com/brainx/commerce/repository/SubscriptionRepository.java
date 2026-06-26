package com.brainx.commerce.repository;

import com.brainx.commerce.entity.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    long countByStatus(Subscription.Status status);

    List<Subscription> findByStatus(Subscription.Status status);

    List<Subscription> findAllByOrderByCreatedAtDesc();
}
