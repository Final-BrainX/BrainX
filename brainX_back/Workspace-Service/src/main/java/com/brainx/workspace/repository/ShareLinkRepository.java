package com.brainx.workspace.repository;

import com.brainx.workspace.entity.ShareLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ShareLinkRepository extends JpaRepository<ShareLink, String> {
    Optional<ShareLink> findByShareIdAndUserId(String shareId, String userId);
}
