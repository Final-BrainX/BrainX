package com.brainx.intelligence.infrastructure.persistence.jpa.llmops;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.brainx.intelligence.llmops.domain.LlmRunStatus;

interface LlmRunJpaRepository extends JpaRepository<LlmRunJpaEntity, String> {

    @Query("""
        select run
        from LlmRunJpaEntity run
        where (:userId is null or run.userId = :userId)
          and (:featureId is null or run.featureId = :featureId)
          and (:status is null or run.status = :status)
        order by run.startedAt desc, run.llmRunId desc
        """)
    List<LlmRunJpaEntity> listRuns(
        @Param("userId") String userId,
        @Param("featureId") String featureId,
        @Param("status") LlmRunStatus status,
        Pageable pageable
    );
}
