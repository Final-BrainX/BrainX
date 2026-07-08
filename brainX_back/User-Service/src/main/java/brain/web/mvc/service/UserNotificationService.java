package brain.web.mvc.service;

import brain.web.mvc.dto.response.UserResponses.NotificationItemResponse;
import brain.web.mvc.dto.response.UserResponses.NotificationDeleteResponse;
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

    /** 개별 확인(markAsRead)과 달리 bulk update 쿼리 한 번으로 처리한다 — 목록에 안 보이는(top20
        범위 밖) 오래된 미확인 알림까지 전부 읽음 처리해야 실제 unreadCount가 0이 되기 때문에,
        엔티티를 하나씩 로드해 markRead()를 호출하는 대신 UPDATE 쿼리로 일괄 반영한다. 처리 시작 시점의
        cutoff를 고정해 두고 그 이전(createdAt <= cutoff) 알림만 읽음 처리해서, 요청 처리 중 새로
        생긴 알림은 unread로 남긴다. */
    @Transactional
    public NotificationsResponse markAllAsRead(String userId) {
        LocalDateTime cutoff = LocalDateTime.now();
        userNotificationRepository.markAllAsReadByUserUserId(userId, cutoff, cutoff);
        return getMyNotifications(userId);
    }

    @Transactional
    public NotificationDeleteResponse deleteNotification(String userId, String notificationId) {
        UserNotification notification = userNotificationRepository.findByNotificationIdAndUserUserId(notificationId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "알림을 찾을 수 없습니다."));
        userNotificationRepository.delete(notification);
        long unreadCount = userNotificationRepository.countByUserUserIdAndReadAtIsNull(userId);
        return NotificationDeleteResponse.builder()
                .notificationId(notificationId)
                .unreadCount(unreadCount)
                .build();
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
