package brain.web.mvc.repository;

import brain.web.mvc.entity.UserNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserNotificationRepository extends JpaRepository<UserNotification, String> {
    List<UserNotification> findTop20ByUserUserIdOrderByCreatedAtDesc(String userId);

    Optional<UserNotification> findByNotificationIdAndUserUserId(String notificationId, String userId);

    long countByUserUserIdAndReadAtIsNull(String userId);

    @Modifying(clearAutomatically = true)
    @Query("UPDATE UserNotification n SET n.readAt = :now WHERE n.user.userId = :userId AND n.readAt IS NULL AND n.createdAt <= :cutoff")
    int markAllAsReadByUserUserId(@Param("userId") String userId, @Param("now") LocalDateTime now, @Param("cutoff") LocalDateTime cutoff);
}
