package brain.web.mvc.service;

import brain.web.mvc.dto.response.UserResponses.NotificationItemResponse;
import brain.web.mvc.dto.response.UserResponses.NotificationsResponse;
import brain.web.mvc.entity.User;
import brain.web.mvc.entity.UserNotification;
import brain.web.mvc.exception.ApiException;
import brain.web.mvc.repository.UserNotificationRepository;
import brain.web.mvc.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserNotificationService {
    private final UserRepository userRepository;
    private final UserNotificationRepository userNotificationRepository;

    @Transactional(readOnly = true)
    public NotificationsResponse getMyNotifications(String userId) {
        List<NotificationItemResponse> notifications = userNotificationRepository.findTop20ByUserUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();

        long unreadCount = notifications.stream().filter((item) -> !item.read()).count();
        return NotificationsResponse.builder()
                .notifications(notifications)
                .unreadCount(unreadCount)
                .build();
    }

    @Transactional
    public NotificationItemResponse markAsRead(String userId, String notificationId) {
        UserNotification notification = userNotificationRepository.findByNotificationIdAndUserUserId(notificationId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "알림을 찾을 수 없습니다."));
        notification.markRead(LocalDateTime.now());
        return toResponse(notification);
    }

    @Transactional
    public void createNotifications(List<String> userIds, String type, String title, String body, String sentByAdminUserId, String sentByAdminName) {
        List<User> users = userRepository.findAllById(userIds);
        for (User user : users) {
            userNotificationRepository.save(UserNotification.builder()
                    .user(user)
                    .type(type)
                    .title(title)
                    .body(body)
                    .sentByAdminUserId(sentByAdminUserId)
                    .sentByAdminName(sentByAdminName)
                    .build());
        }
    }

    private NotificationItemResponse toResponse(UserNotification notification) {
        return NotificationItemResponse.builder()
                .notificationId(notification.getNotificationId())
                .type(notification.getType())
                .title(notification.getTitle())
                .body(notification.getBody())
                .sentByAdminName(notification.getSentByAdminName())
                .read(notification.getReadAt() != null)
                .createdAt(notification.getCreatedAt())
                .readAt(notification.getReadAt())
                .build();
    }
}
