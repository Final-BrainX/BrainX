package com.brainx.workspace.repository;

import com.brainx.workspace.entity.ShareLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ShareLinkRepository extends JpaRepository<ShareLink, String> {
    List<ShareLink> findByNoteIdAndRevokedFalse(String noteId);
    Optional<ShareLink> findByShareIdAndRevokedFalse(String shareId);
}
