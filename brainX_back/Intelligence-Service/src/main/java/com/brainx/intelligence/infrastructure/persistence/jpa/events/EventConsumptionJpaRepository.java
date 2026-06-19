package com.brainx.intelligence.infrastructure.persistence.jpa.events;

import org.springframework.data.jpa.repository.JpaRepository;

interface EventConsumptionJpaRepository extends JpaRepository<EventConsumptionJpaEntity, String> {
}
