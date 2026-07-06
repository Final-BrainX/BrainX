package com.brainx.workspace.repository;

import com.brainx.workspace.entity.ShareLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ShareLinkRepository extends JpaRepository<ShareLink, String> {
    Optional<ShareLink> findByShareIdAndUserId(String shareId, String userId);
    List<ShareLink> findByNoteIdAndUserId(String noteId, String userId);

    @Query("SELECT s FROM ShareLink s WHERE s.noteId = :noteId AND s.revoked = false AND s.expiresAt > :now ORDER BY s.createdAt DESC LIMIT 1")
    Optional<ShareLink> findFirstActiveByNoteId(@Param("noteId") String noteId, @Param("now") Instant now);
}
