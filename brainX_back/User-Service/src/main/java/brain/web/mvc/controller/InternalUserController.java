package brain.web.mvc.controller;

import brain.web.mvc.entity.User;
import brain.web.mvc.entity.UserStatus;
import brain.web.mvc.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/internal/v1/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<UserDto>> listUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UserStatus status,
            @RequestParam(required = false) Integer joinedYear
    ) {
        List<User> users = userRepository.findUsersInternal(q, status, joinedYear);
        List<UserDto> dtos = users.stream()
                .map(UserDto::from)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<UserDto> getUserDetail(@PathVariable String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        return ResponseEntity.ok(UserDto.from(user));
    }

    @PatchMapping("/{userId}/status")
    @Transactional
    public ResponseEntity<UserDto> changeStatus(
            @PathVariable String userId,
            @RequestBody Map<String, String> body
    ) {
        UserStatus newStatus = UserStatus.valueOf(body.get("status"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        user.changeStatus(newStatus);
        return ResponseEntity.ok(UserDto.from(user));
    }

    @PostMapping("/{userId}/withdrawal")
    @Transactional
    public ResponseEntity<UserDto> withdrawUser(
            @PathVariable String userId,
            @RequestBody(required = false) Map<String, String> body
    ) {
        String reason = body != null ? body.get("reason") : "Admin requested withdrawal";
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        user.requestDeletion(reason, LocalDateTime.now().plusDays(30));
        return ResponseEntity.ok(UserDto.from(user));
    }

    @PostMapping("/bulk-actions")
    @Transactional
    public ResponseEntity<Map<String, Object>> runBulkAction(@RequestBody Map<String, Object> body) {
        List<String> userIds = (List<String>) body.get("userIds");
        String action = (String) body.get("action");
        int accepted = 0;
        int failed = 0;

        for (String userId : userIds) {
            try {
                User user = userRepository.findById(userId).orElse(null);
                if (user != null) {
                    if ("SUSPEND".equals(action)) {
                        user.changeStatus(UserStatus.SUSPENDED);
                    } else if ("REACTIVATE".equals(action)) {
                        user.changeStatus(UserStatus.ACTIVE);
                    } else if ("WITHDRAW".equals(action)) {
                        user.requestDeletion("Admin Bulk Withdrawal", LocalDateTime.now().plusDays(30));
                    }
                    accepted++;
                } else {
                    failed++;
                }
            } catch (Exception e) {
                failed++;
            }
        }
        return ResponseEntity.ok(Map.of("accepted", accepted, "failed", failed, "jobId", "JOB-BULK-" + System.currentTimeMillis()));
    }

    public record UserDto(
            String userId,
            String email,
            String nickname,
            String role,
            UserStatus status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            LocalDateTime deletionScheduledAt,
            String deletionReason
    ) {
        public static UserDto from(User user) {
            return new UserDto(
                    user.getUserId(),
                    user.getEmail(),
                    user.getNickname(),
                    user.getRole().name(),
                    user.getStatus(),
                    user.getCreatedAt(),
                    user.getUpdatedAt(),
                    user.getDeletionScheduledAt(),
                    user.getDeletionReason()
            );
        }
    }
}
