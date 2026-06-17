package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, String> {
    Optional<Folder> findByFolderIdAndUserId(String folderId, String userId);
    List<Folder> findByUserIdOrderByNameAsc(String userId);
}
