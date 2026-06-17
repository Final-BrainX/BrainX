package com.brainx.workspace.repository;

import com.brainx.workspace.entity.GraphLayout;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GraphLayoutRepository extends JpaRepository<GraphLayout, String> {
    Optional<GraphLayout> findByLayoutIdAndUserId(String layoutId, String userId);
}
