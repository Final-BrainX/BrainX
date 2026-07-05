package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface AgentMessageJpaRepository extends JpaRepository<AgentMessageJpaEntity, String> {

    List<AgentMessageJpaEntity> findByUserIdAndThreadIdOrderByCreatedAtAsc(String userId, String threadId);

    Optional<AgentMessageJpaEntity> findFirstByUserIdAndThreadIdOrderByCreatedAtDescMessageIdDesc(
        String userId,
        String threadId
    );
}
