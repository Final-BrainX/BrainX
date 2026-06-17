package com.brainx.workspace.repository;

import com.brainx.workspace.entity.RecentActivity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecentActivityRepository extends JpaRepository<RecentActivity, String> {
    List<RecentActivity> findByUserIdOrderByActivityAtDesc(String userId, Pageable pageable);
}
