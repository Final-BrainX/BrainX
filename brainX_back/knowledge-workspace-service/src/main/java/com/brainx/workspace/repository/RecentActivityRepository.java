package com.brainx.workspace.repository;

import com.brainx.workspace.entity.RecentActivity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RecentActivityRepository extends JpaRepository<RecentActivity, String> {
    List<RecentActivity> findByUserIdOrderByViewedAtDesc(String userId, Pageable pageable);
    Optional<RecentActivity> findByUserIdAndNoteId(String userId, String noteId);
}
