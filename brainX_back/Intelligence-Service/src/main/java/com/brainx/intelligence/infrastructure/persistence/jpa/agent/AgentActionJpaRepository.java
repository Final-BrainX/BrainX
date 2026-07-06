package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.brainx.intelligence.agent.domain.AgentActionStatus;

interface AgentActionJpaRepository extends JpaRepository<AgentActionJpaEntity, String> {

    Optional<AgentActionJpaEntity> findByUserIdAndActionId(String userId, String actionId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        update AgentActionJpaEntity action
           set action.status = :nextStatus,
               action.decidedAt = :decidedAt
         where action.userId = :userId
           and action.actionId = :actionId
           and action.status = :expectedStatus
        """)
    int updateStatusIfCurrent(
        @Param("userId") String userId,
        @Param("actionId") String actionId,
        @Param("expectedStatus") AgentActionStatus expectedStatus,
        @Param("nextStatus") AgentActionStatus nextStatus,
        @Param("decidedAt") java.time.Instant decidedAt
    );

    List<AgentActionJpaEntity> findByUserIdAndThreadIdOrderByCreatedAtAsc(String userId, String threadId);
}
