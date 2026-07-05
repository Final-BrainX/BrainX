package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Workspace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkspaceRepository extends JpaRepository<Workspace, String> {
    @Query("""
            select w
            from Workspace w
            where w.userId = :userId
              and w.isDefault = true
            order by w.createdAt asc
            """)
    List<Workspace> findDefaultWorkspacesByUserId(@Param("userId") String userId);
}
