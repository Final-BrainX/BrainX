package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FavoriteRepository extends JpaRepository<Favorite, String> {
    List<Favorite> findByUserId(String userId);
    Optional<Favorite> findByUserIdAndTargetTypeAndTargetId(String userId, String targetType, String targetId);
    void deleteByUserIdAndTargetTypeAndTargetId(String userId, String targetType, String targetId);
}
