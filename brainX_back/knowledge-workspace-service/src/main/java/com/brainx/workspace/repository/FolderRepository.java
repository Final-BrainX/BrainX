package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FolderRepository extends JpaRepository<Folder, String> {
    List<Folder> findByUserId(String userId);
    Optional<Folder> findByFolderIdAndUserId(String folderId, String userId);
}
