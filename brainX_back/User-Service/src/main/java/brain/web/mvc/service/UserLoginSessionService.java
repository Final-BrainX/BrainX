package brain.web.mvc.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
@Slf4j
@RequiredArgsConstructor
public class UserLoginSessionService {
    private static final String SESSION_HISTORY_KEY_FORMAT = "user:login:sessions:%s";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${brainx.auth.session-history-ttl-seconds:2592000}")
    private long sessionHistoryTtlSeconds;

    @Value("${brainx.auth.session-history-max-items:20}")
    private int sessionHistoryMaxItems;

    public void recordLoginSession(String userId, String sessionId, HttpServletRequest request) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(sessionId)) {
            return;
        }

        try {
            Instant now = Instant.now();
            SessionRecord next = new SessionRecord(
                    sessionId,
                    userId,
                    resolveDevice(request),
                    resolveLocation(request),
                    resolveIpAddress(request),
                    hashUserAgent(request),
                    toLocalDateTime(now),
                    toLocalDateTime(now),
                    null,
                    true
            );

            List<SessionRecord> sessions = loadSessions(userId);
            sessions.removeIf(session -> session.sessionId().equals(sessionId));
            sessions.add(0, next);
            storeSessions(userId, sessions);
        } catch (RuntimeException exception) {
            log.warn("Skipping login session history write for user {} and session {}.", userId, sessionId, exception);
        }
    }

    public void touchSession(String userId, String sessionId, HttpServletRequest request) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(sessionId)) {
            return;
        }

        try {
            List<SessionRecord> sessions = loadSessions(userId);
            boolean changed = false;
            Instant now = Instant.now();
            List<SessionRecord> updated = new ArrayList<>(sessions.size());

            for (SessionRecord session : sessions) {
                if (session.sessionId().equals(sessionId)) {
                    updated.add(new SessionRecord(
                            session.sessionId(),
                            session.userId(),
                            session.device(),
                            session.location(),
                            session.ipAddress(),
                            session.userAgentHash(),
                            session.createdAt(),
                            toLocalDateTime(now),
                            session.endedAt(),
                            session.current()
                    ));
                    changed = true;
                } else {
                    updated.add(session);
                }
            }

            if (!changed) {
                return;
            }

            updated.sort(Comparator.comparing(SessionRecord::lastSeenAt).reversed());
            storeSessions(userId, updated);
        } catch (RuntimeException exception) {
            log.warn("Skipping login session touch for user {} and session {}.", userId, sessionId, exception);
        }
    }

    public void endSession(String userId, String sessionId, HttpServletRequest request) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(sessionId)) {
            return;
        }

        try {
            List<SessionRecord> sessions = loadSessions(userId);
            boolean changed = false;
            Instant now = Instant.now();
            List<SessionRecord> updated = new ArrayList<>(sessions.size());

            for (SessionRecord session : sessions) {
                if (session.sessionId().equals(sessionId)) {
                    updated.add(new SessionRecord(
                            session.sessionId(),
                            session.userId(),
                            session.device(),
                            session.location(),
                            session.ipAddress(),
                            session.userAgentHash(),
                            session.createdAt(),
                            toLocalDateTime(now),
                            toLocalDateTime(now),
                            false
                    ));
                    changed = true;
                } else {
                    updated.add(session);
                }
            }

            if (!changed) {
                return;
            }

            updated.sort(Comparator.comparing(SessionRecord::lastSeenAt).reversed());
            storeSessions(userId, updated);
        } catch (RuntimeException exception) {
            log.warn("Skipping login session end for user {} and session {}.", userId, sessionId, exception);
        }
    }

    public LoginSessionSnapshot latestSession(String userId) {
        try {
            List<SessionRecord> sessions = loadSessions(userId);
            if (sessions.isEmpty()) {
                return null;
            }
            return sessions.get(0).toSnapshot();
        } catch (RuntimeException exception) {
            log.warn("Unable to read latest login session history for user {}.", userId, exception);
            return null;
        }
    }

    public List<LoginSessionSnapshot> listSessions(String userId) {
        try {
            return loadSessions(userId).stream()
                    .sorted(Comparator.comparing(SessionRecord::lastSeenAt).reversed())
                    .map(SessionRecord::toSnapshot)
                    .toList();
        } catch (RuntimeException exception) {
            log.warn("Unable to read login session history for user {}.", userId, exception);
            return List.of();
        }
    }

    private List<SessionRecord> loadSessions(String userId) {
        String raw = redisTemplate.opsForValue().get(sessionHistoryKey(userId));
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>();
        }

        try {
            List<SessionRecord> sessions = objectMapper.readValue(raw, new TypeReference<>() {});
            return new ArrayList<>(sessions);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize login session history.", exception);
        }
    }

    private void storeSessions(String userId, List<SessionRecord> sessions) {
        List<SessionRecord> trimmed = sessions.stream()
                .sorted(Comparator.comparing(SessionRecord::lastSeenAt).reversed())
                .limit(sessionHistoryMaxItems)
                .toList();

        try {
            redisTemplate.opsForValue().set(
                    sessionHistoryKey(userId),
                    objectMapper.writeValueAsString(trimmed),
                    Duration.ofSeconds(sessionHistoryTtlSeconds)
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize login session history.", exception);
        }
    }

    private String sessionHistoryKey(String userId) {
        return SESSION_HISTORY_KEY_FORMAT.formatted(userId);
    }

    private LocalDateTime toLocalDateTime(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
    }

    private String resolveIpAddress(HttpServletRequest request) {
        if (request == null) {
            return "127.0.0.1";
        }
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            String first = forwardedFor.split(",")[0].trim();
            if (StringUtils.hasText(first)) {
                return first;
            }
        }
        String realIp = request.getHeader("X-Real-IP");
        if (StringUtils.hasText(realIp)) {
            return realIp.trim();
        }
        String remoteAddr = request.getRemoteAddr();
        return StringUtils.hasText(remoteAddr) ? remoteAddr : "127.0.0.1";
    }

    private String resolveLocation(HttpServletRequest request) {
        if (request == null) {
            return "Unknown";
        }
        String location = firstNonBlank(
                request.getHeader("X-Client-Location"),
                request.getHeader("X-Client-Timezone"),
                request.getHeader("X-Timezone"),
                request.getLocale() != null ? request.getLocale().toLanguageTag() : null
        );
        return StringUtils.hasText(location) ? location : "Unknown";
    }

    private String resolveDevice(HttpServletRequest request) {
        String userAgent = request != null ? request.getHeader("User-Agent") : null;
        if (!StringUtils.hasText(userAgent)) {
            return "Unknown / Unknown";
        }

        String normalized = userAgent.toLowerCase(Locale.ROOT);
        if (normalized.contains("iphone") || normalized.contains("ipad") || normalized.contains("ios")) {
            return normalized.contains("crios") ? "Chrome / iOS" : "Safari / iOS";
        }
        if (normalized.contains("android")) {
            return normalized.contains("edg") ? "Edge / Android" : "Chrome / Android";
        }
        if (normalized.contains("windows")) {
            if (normalized.contains("edg")) {
                return "Edge / Windows";
            }
            if (normalized.contains("firefox")) {
                return "Firefox / Windows";
            }
            return "Chrome / Windows";
        }
        if (normalized.contains("mac os x") || normalized.contains("macintosh")) {
            if (normalized.contains("chrome") && !normalized.contains("edg") && !normalized.contains("crios")) {
                return "Chrome / macOS";
            }
            return "Safari / macOS";
        }
        return "Browser / Unknown";
    }

    private String hashUserAgent(HttpServletRequest request) {
        String userAgent = request != null ? request.getHeader("User-Agent") : null;
        if (!StringUtils.hasText(userAgent)) {
            return null;
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(userAgent.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte value : hash) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Failed to hash user agent.", exception);
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    public record LoginSessionSnapshot(
            String sessionId,
            String device,
            String location,
            String ipAddress,
            String userAgentHash,
            LocalDateTime lastSeenAt,
            boolean current
    ) {
    }

    private record SessionRecord(
            String sessionId,
            String userId,
            String device,
            String location,
            String ipAddress,
            String userAgentHash,
            LocalDateTime createdAt,
            LocalDateTime lastSeenAt,
            LocalDateTime endedAt,
            boolean current
    ) {
        private LoginSessionSnapshot toSnapshot() {
            return new LoginSessionSnapshot(sessionId, device, location, ipAddress, userAgentHash, lastSeenAt, current);
        }
    }
}
