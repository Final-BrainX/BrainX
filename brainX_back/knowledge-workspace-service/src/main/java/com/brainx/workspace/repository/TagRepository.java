package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Tag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TagRepository extends JpaRepository<Tag, String> {
    List<Tag> findByUserId(String userId);
    Optional<Tag> findByUserIdAndName(String userId, String name);
    List<Tag> findByUserIdAndNameContainingIgnoreCase(String userId, String query);
}
