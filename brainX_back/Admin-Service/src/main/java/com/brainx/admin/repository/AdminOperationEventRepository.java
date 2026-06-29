package com.brainx.admin.repository;

import com.brainx.admin.entity.AdminOperationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdminOperationEventRepository extends JpaRepository<AdminOperationEvent, String> {
    List<AdminOperationEvent> findTop20ByOrderByCreatedAtDesc();
    List<AdminOperationEvent> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(String targetType, String targetId);
}
