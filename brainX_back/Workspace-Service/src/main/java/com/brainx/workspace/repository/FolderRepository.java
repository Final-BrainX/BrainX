package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, String> {
    Optional<Folder> findByFolderIdAndUserId(String folderId, String userId);
    List<Folder> findByUserIdOrderByNameAsc(String userId);

    /** 같은 Workspace(documentGroupId)의 같은 depth(parentFolderId) 형제 폴더만 조회 —
        derived query의 "= :param"은 NULL(루트)을 매치하지 못해 직접 JPQL로 null/non-null
        양쪽을 처리한다. documentGroupId는 null을 wildcard로 취급하지 않고 null끼리만
        (Guest/레거시 데이터) 매치한다. */
    @Query("SELECT f FROM Folder f WHERE f.userId = :userId AND " +
            "((:documentGroupId IS NULL AND f.documentGroupId IS NULL) OR f.documentGroupId = :documentGroupId) AND " +
            "((:parentFolderId IS NULL AND f.parentFolderId IS NULL) OR f.parentFolderId = :parentFolderId)")
    List<Folder> findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(@Param("userId") String userId,
                                                                         @Param("documentGroupId") String documentGroupId,
                                                                         @Param("parentFolderId") String parentFolderId);
}
