package brain.web.mvc.repository;

import brain.web.mvc.entity.UserNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserNotificationRepository extends JpaRepository<UserNotification, String> {
    List<UserNotification> findTop20ByUserUserIdOrderByCreatedAtDesc(String userId);

    Optional<UserNotification> findByNotificationIdAndUserUserId(String notificationId, String userId);
}
