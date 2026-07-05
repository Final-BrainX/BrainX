package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Workspace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WorkspaceRepository extends JpaRepository<Workspace, String> {
    @Query("""
            select w
            from Workspace w
            where w.userId = :userId
              and w.isDefault = true
            order by w.createdAt asc
            """)
    List<Workspace> findDefaultWorkspacesByUserId(@Param("userId") String userId);

    @Query("""
            select w
            from Workspace w
            where w.userId = :userId
            order by case when w.isDefault = true then 0 else 1 end, w.createdAt asc
            """)
    List<Workspace> findByUserIdOrderByDefaultFirst(@Param("userId") String userId);

    Optional<Workspace> findByDocumentGroupIdAndUserId(String documentGroupId, String userId);

    boolean existsByUserIdAndName(String userId, String name);

    boolean existsByUserIdAndNameAndDocumentGroupIdNot(String userId, String name, String documentGroupId);
}
