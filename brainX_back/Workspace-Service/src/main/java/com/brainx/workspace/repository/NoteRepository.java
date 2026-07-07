package com.brainx.workspace.repository;

import com.brainx.workspace.entity.Note;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, String> {
    Optional<Note> findByNoteIdAndUserId(String noteId, String userId);
    List<Note> findByUserIdOrderByUpdatedAtDesc(String userId);
    List<Note> findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(String userId);
    List<Note> findByUserIdAndFolderIdAndDeletedFalse(String userId, String folderId);
    List<Note> findByUserIdAndFolderIdIn(String userId, Collection<String> folderIds);
    Optional<Note> findFirstByUserIdAndTitleAndDeletedFalse(String userId, String title);

    @Query("SELECT n FROM Note n WHERE n.userId = :userId AND n.title = :title AND n.deleted = false AND " +
            "((:documentGroupId IS NULL AND n.documentGroupId IS NULL) OR n.documentGroupId = :documentGroupId) " +
            "ORDER BY n.createdAt ASC LIMIT 1")
    Optional<Note> findFirstByUserIdAndDocumentGroupIdAndTitleAndDeletedFalse(@Param("userId") String userId,
                                                                               @Param("documentGroupId") String documentGroupId,
                                                                               @Param("title") String title);

    @Query("SELECT n FROM Note n WHERE n.userId = :userId AND LOWER(n.title) = LOWER(:title) AND n.deleted = false ORDER BY n.createdAt ASC LIMIT 1")
    Optional<Note> findFirstByUserIdAndTitleIgnoreCaseAndDeletedFalse(@Param("userId") String userId, @Param("title") String title);

    /** 같은 Workspace(documentGroupId)의 같은 folderId(루트면 null) 안에서, 삭제되지 않은
        형제 노트만 조회한다 — derived query의 "= :param"은 NULL을 매치하지 못해 직접 JPQL로
        null/non-null 양쪽을 처리한다. documentGroupId는 null을 wildcard로 취급하지 않고
        null끼리만(Guest/레거시 데이터) 매치한다 — 그래야 서로 다른 Workspace의 루트나,
        Guest/레거시 null 데이터가 회원의 실제 Workspace 데이터와 섞이지 않는다. */
    @Query("SELECT n FROM Note n WHERE n.userId = :userId AND n.deleted = false AND " +
            "((:documentGroupId IS NULL AND n.documentGroupId IS NULL) OR n.documentGroupId = :documentGroupId) AND " +
            "((:folderId IS NULL AND n.folderId IS NULL) OR n.folderId = :folderId)")
    List<Note> findSiblingsByUserIdAndDocumentGroupIdAndFolderId(@Param("userId") String userId,
                                                                 @Param("documentGroupId") String documentGroupId,
                                                                 @Param("folderId") String folderId);

    List<Note> findByDeletedFalseOrderByUpdatedAtDesc();
    List<Note> findByDeletedFalseOrderByCreatedAtDesc();
    long countByUserIdAndDeletedFalse(String userId);
    long countByDeletedFalse();
    List<Note> findTop5ByUserIdAndDeletedFalseOrderByUpdatedAtDesc(String userId);
}
