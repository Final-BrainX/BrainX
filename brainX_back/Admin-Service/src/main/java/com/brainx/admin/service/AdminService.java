package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.*;
import com.brainx.admin.entity.AdminDesktopDownloadEvent;
import com.brainx.admin.entity.AdminMonitoringSnapshot;
import com.brainx.admin.entity.AdminOperationEvent;
import com.brainx.admin.entity.AdminServiceHealthSnapshot;
import com.brainx.admin.repository.AdminDesktopDownloadEventRepository;
import com.brainx.admin.repository.AdminMonitoringSnapshotRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.repository.AdminServiceHealthSnapshotRepository;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminService {
    private static final Logger log = LoggerFactory.getLogger(AdminService.class);
    private static final OffsetDateTime BASE = OffsetDateTime.now();
    private static final int HEALTH_UPTIME_SAMPLE_SIZE = 20;
    private static final int OVERVIEW_TREND_DAYS = 14;
    private static final int DOWNLOAD_TREND_DAYS = 7;
    private static final long DEGRADED_LATENCY_THRESHOLD_MS = 1_000L;

    private final RestClient userRestClient;
    private final RestClient commerceRestClient;
    private final RestClient workspaceRestClient;
    private final RestClient defaultRestClient;
    private final AdminRefundNotificationService refundNotificationService;
    private final AdminKafkaLagCollector kafkaLagCollector;

    private final AdminDesktopDownloadEventRepository desktopDownloadEventRepository;
    private final AdminOperationEventRepository operationEvents;
    private final AdminServiceHealthSnapshotRepository healthSnapshotRepository;
    private final AdminMonitoringSnapshotRepository monitoringSnapshotRepository;

    @Value("${brainx.services.user-health-url}")
    private String userHealthUrl;

    @Value("${brainx.services.commerce-health-url}")
    private String commerceHealthUrl;

    @Value("${brainx.services.workspace-health-url}")
    private String workspaceHealthUrl;

    @Value("${brainx.services.ingestion-health-url}")
    private String ingestionHealthUrl;

    @Value("${brainx.services.intelligence-health-url}")
    private String intelligenceHealthUrl;

    @Value("${brainx.services.mcp-health-url}")
    private String mcpHealthUrl;

    @Value("${brainx.service-token}")
    private String serviceToken;

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String kafkaBootstrapServers;

    @Value("${brainx.kafka.monitoring.consumer-group-id:intelligence-service}")
    private String kafkaMonitoringConsumerGroupId;

    @Value("${brainx.admin.monitoring.timezone:Asia/Seoul}")
    private String monitoringTimezone;

    public AdminService(
            RestClient userRestClient,
            RestClient commerceRestClient,
            RestClient workspaceRestClient,
            RestClient defaultRestClient,
            AdminRefundNotificationService refundNotificationService,
            AdminKafkaLagCollector kafkaLagCollector,
            AdminDesktopDownloadEventRepository desktopDownloadEventRepository,
            AdminOperationEventRepository operationEvents,
            AdminServiceHealthSnapshotRepository healthSnapshotRepository,
            AdminMonitoringSnapshotRepository monitoringSnapshotRepository
    ) {
        this.userRestClient = userRestClient;
        this.commerceRestClient = commerceRestClient;
        this.workspaceRestClient = workspaceRestClient;
        this.defaultRestClient = defaultRestClient;
        this.refundNotificationService = refundNotificationService;
        this.kafkaLagCollector = kafkaLagCollector;
        this.desktopDownloadEventRepository = desktopDownloadEventRepository;
        this.operationEvents = operationEvents;
        this.healthSnapshotRepository = healthSnapshotRepository;
        this.monitoringSnapshotRepository = monitoringSnapshotRepository;
    }

    public AdminDashboardOverviewData dashboardOverview() {
        OffsetDateTime capturedAt = currentMonitoringTime();
        AdminBillingSummaryData summary = billingSummary();
        TrendSeriesData revenueTrend = fetchRevenueTrend(summary.monthlyRevenue(), OVERVIEW_TREND_DAYS);
        InternalWorkspaceMonitoringSummaryDto workspaceSummary = fetchWorkspaceMonitoringSummary();
        int activeUsers = resolveLiveActiveUsers();
        TrendSeriesData activeUserTrend = buildOverviewActiveUserTrend(capturedAt, activeUsers);
        DesktopDownloadSummary desktopDownloadSummary = desktopDownloadSummary(capturedAt);
        SnapshotDelta delta = snapshotDelta();

        List<ServiceHealthData> healths = collectServiceHealths(false, capturedAt);

        List<KpiData> kpis = buildOverviewKpisLive(summary, activeUsers, desktopDownloadSummary.desktopDownloadUsers(), delta); /*
                new KpiData("이번 달 매출", formatMoney(summary.monthlyRevenue()), "live", "good", "Commerce-Service 집계"),
                new KpiData("활성 구독", String.valueOf(summary.activeSubscriptions()), "live", "good", "현재 유료 구독"),
                new KpiData("MRR", formatMoney(summary.mrr()), "live", "good", "월 반복 매출"),
                new KpiData(
                        "결제 실패",
                        String.valueOf(summary.failedPaymentCount()),
                        summary.failedPaymentCount() > 0 ? "action" : "stable",
                        summary.failedPaymentCount() > 0 ? "bad" : "good",
                        "재시도 또는 안내 필요"
                )
        ); */

        return new AdminDashboardOverviewData(
                kpis,
                healths,
                buildDashboardLogs(workspaceSummary),
                revenueTrend,
                activeUserTrend,
                desktopDownloadSummary.trend(),
                new AdminOverviewSummaryData(
                        summary.monthlyRevenue(),
                        summary.activeSubscriptions(),
                        summary.mrr(),
                        summary.failedPaymentCount(),
                        activeUsers,
                        desktopDownloadSummary.desktopDownloadUsers(),
                        desktopDownloadSummary.desktopDownloadCount(),
                        workspaceSummary.totalNotes(),
                        workspaceSummary.totalStorageBytes(),
                        workspaceSummary.notesCreatedToday(),
                        "Asia/Seoul",
                        "Commerce-Service",
                        "User-Service",
                        "Workspace-Service"
                )
        );
    }

    public AdminMonitoringSnapshotData captureDailyMonitoringSnapshot() {
        return captureDailyMonitoringSnapshot(currentMonitoringTime());
    }

    public AdminMonitoringSnapshotData captureDailyMonitoringSnapshot(OffsetDateTime capturedAt) {
        OffsetDateTime effectiveCapturedAt = capturedAt == null ? currentMonitoringTime() : capturedAt;
        SnapshotWindow window = snapshotWindow(effectiveCapturedAt);
        return monitoringSnapshotRepository
                .findTopByCapturedAtGreaterThanEqualAndCapturedAtLessThanOrderByCapturedAtDesc(window.start(), window.end())
                .map(existing -> {
                    log.info(
                            "Daily monitoring snapshot already exists for date={} snapshotId={}",
                            window.snapshotDate(),
                            existing.getSnapshotId()
                    );
                    return toMonitoringSnapshotData(existing);
                })
                .orElseGet(() -> {
                    AdminBillingSummaryData summary = billingSummary();
                    int activeUsers = resolveLiveActiveUsers();
                    DesktopDownloadSummary desktopDownloadSummary = desktopDownloadSummary(effectiveCapturedAt);

                    collectServiceHealths(true, effectiveCapturedAt);
                    AdminKafkaLagObservation kafkaLag = kafkaLagCollector.collect(kafkaMonitoringConsumerGroupId);
                    AdminMonitoringSnapshot saved = monitoringSnapshotRepository.save(new AdminMonitoringSnapshot(
                            summary.monthlyRevenue(),
                            summary.activeSubscriptions(),
                            summary.mrr(),
                            summary.failedPaymentCount(),
                            activeUsers,
                            desktopDownloadSummary.desktopDownloadUsers(),
                            desktopDownloadSummary.desktopDownloadCount(),
                            kafkaLag.messages(),
                            kafkaLag.consumerGroupId(),
                            kafkaLag.state(),
                            kafkaLag.detail(),
                            effectiveCapturedAt
                    ));

                    log.info(
                            "Persisted daily monitoring snapshot snapshotId={} date={} capturedAt={}",
                            saved.getSnapshotId(),
                            window.snapshotDate(),
                            effectiveCapturedAt
                    );
                    return toMonitoringSnapshotData(saved);
                });
    }

    List<ServiceHealthData> collectServiceHealths(boolean persistSnapshots, OffsetDateTime capturedAt) {
        return List.of(
                checkHealth("User-Service", userHealthUrl, persistSnapshots, capturedAt),
                checkHealth("Commerce-Service", commerceHealthUrl, persistSnapshots, capturedAt),
                checkHealth("Workspace-Service", workspaceHealthUrl, persistSnapshots, capturedAt),
                checkHealth("Ingestion-Service", ingestionHealthUrl, persistSnapshots, capturedAt),
                checkHealth("Intelligence-Service", intelligenceHealthUrl, persistSnapshots, capturedAt),
                checkHealth("Mcp-Service", mcpHealthUrl, persistSnapshots, capturedAt)
        );
    }

    private ServiceHealthData checkHealth(String name, String url, boolean persistSnapshot, OffsetDateTime capturedAt) {
        long start = System.currentTimeMillis();
        ServiceHealthState state = ServiceHealthState.UP;
        long latencyMs;

        try {
            ResponseEntity<String> response = defaultRestClient.get()
                    .uri(url)
                    .header("X-Service-Token", serviceToken)
                    .retrieve()
                    .toEntity(String.class);
            latencyMs = System.currentTimeMillis() - start;
            if (!response.getStatusCode().is2xxSuccessful()) {
                state = ServiceHealthState.DEGRADED;
            } else if (latencyMs >= DEGRADED_LATENCY_THRESHOLD_MS) {
                state = ServiceHealthState.DEGRADED;
            }
        } catch (Exception e) {
            state = ServiceHealthState.DOWN;
            latencyMs = System.currentTimeMillis() - start;
        }

        double uptimePercent = calculateUptimePercent(name, state);
        if (persistSnapshot) {
            healthSnapshotRepository.save(new AdminServiceHealthSnapshot(name, state.name(), latencyMs, uptimePercent, capturedAt));
        }
        return new ServiceHealthData(name, latencyMs + "ms", formatUptimePercent(uptimePercent), state.name());
    }

    public AdminKafkaLagData getKafkaLag() {
        return toKafkaLagData(kafkaLagCollector.collect(kafkaMonitoringConsumerGroupId));
    }

    @Transactional
    public LandingDesktopDownloadData recordDesktopDownload(
            LandingDesktopDownloadRequest request,
            String ipAddress,
            String userAgent
    ) {
        OffsetDateTime downloadedAt = currentMonitoringTime();
        AdminDesktopDownloadEvent saved = desktopDownloadEventRepository.save(new AdminDesktopDownloadEvent(
                request.platform(),
                request.installerVersion(),
                request.source(),
                sha256(request.clientKey()),
                sha256(userAgent),
                normalizeIpAddress(ipAddress),
                downloadedAt
        ));
        return new LandingDesktopDownloadData(
                saved.getDownloadId(),
                saved.getPlatform(),
                saved.getInstallerVersion(),
                saved.getSource(),
                saved.getDownloadedAt()
        );
    }

    private ZoneId monitoringZoneId() {
        return ZoneId.of(monitoringTimezone);
    }

    OffsetDateTime currentMonitoringTime() {
        return OffsetDateTime.now(monitoringZoneId());
    }

    private SnapshotWindow snapshotWindow(OffsetDateTime capturedAt) {
        LocalDate snapshotDate = capturedAt.atZoneSameInstant(monitoringZoneId()).toLocalDate();
        OffsetDateTime start = snapshotDate.atStartOfDay(monitoringZoneId()).toOffsetDateTime();
        OffsetDateTime end = snapshotDate.plusDays(1).atStartOfDay(monitoringZoneId()).toOffsetDateTime();
        return new SnapshotWindow(snapshotDate, start, end);
    }

    private AdminMonitoringSnapshotData buildLiveMonitoringSnapshotData(OffsetDateTime capturedAt) {
        AdminBillingSummaryData summary = billingSummary();
        int activeUsers = resolveLiveActiveUsers();
        DesktopDownloadSummary desktopDownloadSummary = desktopDownloadSummary(capturedAt);
        AdminKafkaLagObservation kafkaLag = kafkaLagCollector.collect(kafkaMonitoringConsumerGroupId);
        String snapshotDate = snapshotWindow(capturedAt).snapshotDate().toString().replace("-", "");

        return new AdminMonitoringSnapshotData(
                "live_" + snapshotDate,
                summary.monthlyRevenue(),
                summary.activeSubscriptions(),
                summary.mrr(),
                summary.failedPaymentCount(),
                activeUsers,
                desktopDownloadSummary.desktopDownloadUsers(),
                desktopDownloadSummary.desktopDownloadCount(),
                kafkaLag.messages(),
                kafkaLag.consumerGroupId(),
                kafkaLag.state(),
                kafkaLag.detail(),
                capturedAt,
                false
        );
    }

    private record SnapshotWindow(LocalDate snapshotDate, OffsetDateTime start, OffsetDateTime end) {
    }

    private KafkaLagObservation collectKafkaLag(String consumerGroupId) {
        if (consumerGroupId == null || consumerGroupId.isBlank()) {
            return new KafkaLagObservation(null, null, KafkaLagState.CONFIG_MISSING, "Kafka consumer group id 설정이 필요합니다");
        }

        Map<String, Object> config = new HashMap<>();
        config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrapServers);
        config.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 3000);
        config.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, 3000);

        try (AdminClient client = AdminClient.create(config)) {
            Map<TopicPartition, OffsetAndMetadata> committedOffsets = client
                    .listConsumerGroupOffsets(consumerGroupId)
                    .partitionsToOffsetAndMetadata()
                    .get();

            if (committedOffsets == null || committedOffsets.isEmpty()) {
                return new KafkaLagObservation(null, consumerGroupId, KafkaLagState.NO_COMMITTED_OFFSETS, "committed offset이 없어 아직 lag를 집계하지 못했습니다");
            }

            Map<TopicPartition, OffsetSpec> offsetSpecs = committedOffsets.keySet().stream()
                    .collect(Collectors.toMap(partition -> partition, partition -> OffsetSpec.latest()));
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = client.listOffsets(offsetSpecs).all().get();

            long totalLag = 0L;
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : committedOffsets.entrySet()) {
                TopicPartition partition = entry.getKey();
                long committedOffset = entry.getValue() != null ? entry.getValue().offset() : 0L;
                ListOffsetsResult.ListOffsetsResultInfo endOffsetInfo = latestOffsets.get(partition);
                long endOffset = endOffsetInfo != null ? endOffsetInfo.offset() : committedOffset;
                totalLag += Math.max(0L, endOffset - committedOffset);
            }

            int kafkaLagMessages = totalLag > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) totalLag;
            String detail = kafkaLagMessages == 0
                    ? "현재 backlog가 없습니다"
                    : "현재 lag " + kafkaLagMessages + " msgs";
            return new KafkaLagObservation(kafkaLagMessages, consumerGroupId, KafkaLagState.HEALTHY, detail);
        } catch (Exception exception) {
            log.warn("Kafka lag collection failed for group {}: {}", consumerGroupId, exception.getMessage());
            return new KafkaLagObservation(null, consumerGroupId, KafkaLagState.BROKER_UNREACHABLE, "Kafka broker 연결 실패 또는 offset 조회 실패");
        }
    }

    private AdminMonitoringSnapshotData toMonitoringSnapshotData(AdminMonitoringSnapshot snapshot) {
        return new AdminMonitoringSnapshotData(
                snapshot.getSnapshotId(),
                snapshot.getMonthlyRevenue(),
                snapshot.getActiveSubscriptions(),
                snapshot.getMrr(),
                snapshot.getFailedPaymentCount(),
                snapshot.getActiveUsers(),
                snapshot.getDesktopDownloadUsers(),
                snapshot.getDesktopDownloadCount(),
                snapshot.getKafkaLagMessages(),
                snapshot.getKafkaConsumerGroupId(),
                snapshot.getKafkaLagState(),
                snapshot.getKafkaLagDetail(),
                snapshot.getCapturedAt(),
                true
        );
    }

    private AdminKafkaLagData toKafkaLagData(AdminKafkaLagObservation observation) {
        return new AdminKafkaLagData(
                observation.consumerGroupId(),
                observation.state(),
                observation.messages(),
                KAFKA_LAG_WARNING_THRESHOLD,
                KAFKA_LAG_CRITICAL_THRESHOLD,
                observation.detail(),
                currentMonitoringTime()
        );
    }

    public List<AdminMonitoringSnapshotData> getMonitoringSnapshots() {
        OffsetDateTime now = currentMonitoringTime();
        SnapshotWindow today = snapshotWindow(now);
        List<AdminMonitoringSnapshotData> persistedSnapshots = safeFindAllMonitoringSnapshotsDesc().stream()
                .map(this::toMonitoringSnapshotData)
                .toList();

        boolean hasTodaySnapshot = persistedSnapshots.stream()
                .anyMatch(snapshot -> !snapshot.capturedAt().isBefore(today.start()) && snapshot.capturedAt().isBefore(today.end()));
        if (hasTodaySnapshot) {
            return persistedSnapshots;
        }

        List<AdminMonitoringSnapshotData> snapshots = new ArrayList<>();
        snapshots.add(buildLiveMonitoringSnapshotData(now));
        snapshots.addAll(persistedSnapshots);
        return snapshots;
    }

    public void deleteMonitoringSnapshot(String id) {
        monitoringSnapshotRepository.deleteById(id);
    }

    public List<AdminServiceHealthSnapshotData> getHealthSnapshots() {
        return healthSnapshotRepository.findAll().stream()
                .map(this::toHealthSnapshotData)
                .toList();
    }

    public void deleteHealthSnapshot(String id) {
        healthSnapshotRepository.deleteById(id);
    }

    private AdminServiceHealthSnapshotData toHealthSnapshotData(AdminServiceHealthSnapshot snapshot) {
        return new AdminServiceHealthSnapshotData(
                snapshot.getHealthSnapshotId(),
                snapshot.getServiceName(),
                normalizeHealthState(snapshot.getState()),
                snapshot.getLatencyMs(),
                snapshot.getUptimePercent(),
                snapshot.getCapturedAt()
        );
    }

    public AdminUsersData listUsers(String q, PlanId planId, ManagedUserStatus status, Integer joinedYear, int page, int size) {
        List<InternalUserDto> usersFromService = userRestClient.get()
                .uri(builder -> builder.path("/internal/v1/users")
                        .queryParam("q", q)
                        .queryParam("status", status != null ? status.name() : null)
                        .queryParam("joinedYear", joinedYear)
                        .build())
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalUserDto>>() {});

        if (usersFromService == null) {
            usersFromService = Collections.emptyList();
        }

        Map<String, String> userPlans = resolveUserPlans();
        Map<String, InternalUserWorkspaceStatsDto> workspaceStatsByUser = new HashMap<>();
        usersFromService.forEach(user -> workspaceStatsByUser.put(user.userId(), loadWorkspaceStats(user.userId())));

        List<AdminUserRow> rows = usersFromService.stream()
                .map(user -> mapUserRow(
                        user,
                        userPlans.getOrDefault(user.userId(), "free"),
                        workspaceStatsByUser.getOrDefault(user.userId(), new InternalUserWorkspaceStatsDto(0, 0L, List.of())),
                        List.of()
                ))
                .filter(row -> planId == null || row.planId() == planId)
                .toList();

        int total = rows.size();
        return new AdminUsersData(rows, new PaginationData(page, size, total, 1), total);
    }

    public AdminUserDetailData getUserDetail(String userId) {
        InternalUserDto user = userRestClient.get()
                .uri("/internal/v1/users/{userId}", userId)
                .retrieve()
                .body(InternalUserDto.class);

        if (user == null) {
            throw new IllegalArgumentException("User not found: " + userId);
        }

        String userPlan = resolveUserPlans().getOrDefault(userId, "free");
        List<AdminUserLoginSession> sessions = loadLoginSessions(userId);
        InternalUserWorkspaceStatsDto workspaceStats = loadWorkspaceStats(userId);

        AdminUserRow row = mapUserRow(user, userPlan, workspaceStats, sessions);
        List<AdminUserActivity> activities = new ArrayList<>(row.activities());
        workspaceStats.activities().forEach(activity -> activities.add(new AdminUserActivity(
                activity.noteId(),
                activity.type(),
                ("NOTE_CREATED".equals(activity.type()) ? "노트 작성: " : "노트 수정: ") + activity.title(),
                activity.occurredAt() != null ? activity.occurredAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
        )));
        activities.sort(Comparator.comparing(AdminUserActivity::occurredAt).reversed());

        return new AdminUserDetailData(
                row.userId(),
                row.name(),
                row.email(),
                row.planId(),
                row.status(),
                workspaceStats.noteCount(),
                workspaceStats.storageBytes(),
                row.joinedAt(),
                row.lastActiveAt(),
                row.lastLogin(),
                sessions,
                activities
        );
    }

    @Transactional
    public AdminUserPlanChangeData changeUserPlan(String userId, AdminUserPlanChangeRequest request) {
        recordOperation("USER_PLAN_CHANGE", "USER", userId, "targetPlanId=" + request.targetPlanId());

        commerceRestClient.patch()
                .uri("/internal/v1/billing/subscriptions/{userId}/plan", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("targetPlanId", request.targetPlanId().name()))
                .retrieve()
                .toBodilessEntity();

        return new AdminUserPlanChangeData(userId, request.targetPlanId(), OffsetDateTime.now());
    }

    @Transactional
    public AdminUserStatusChangeData changeUserStatus(String userId, AdminUserStatusChangeRequest request) {
        recordOperation("USER_STATUS_CHANGE", "USER", userId, "status=" + request.status());

        Map<String, Object> body = new HashMap<>();
        body.put("status", request.status().name());
        if (request.reason() != null) {
            body.put("reason", request.reason());
        }
        if (request.suspendedDays() != null) {
            body.put("suspendedDays", request.suspendedDays());
        }

        userRestClient.patch()
                .uri("/internal/v1/users/{userId}/status", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();

        return new AdminUserStatusChangeData(userId, request.status(), OffsetDateTime.now());
    }

    @Transactional
    public AdminUserWithdrawalData withdrawUser(String userId, AdminUserWithdrawalRequest request) {
        recordOperation("USER_WITHDRAWAL_REQUEST", "USER", userId, null);

        userRestClient.post()
                .uri("/internal/v1/users/{userId}/withdrawal", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", request != null && request.reason() != null ? request.reason() : "Admin requested withdrawal"))
                .retrieve()
                .toBodilessEntity();

        return new AdminUserWithdrawalData(userId, "DEL-" + userId, "REQUESTED");
    }

    @Transactional
    public AdminUserBulkActionData runBulkAction(AdminUserBulkActionRequest request, String adminUserId, String adminName) {
        String jobId = "JOB-" + UUID.randomUUID();
        recordOperation("USER_BULK_" + request.action(), "USER_BULK", String.join(",", request.userIds()), "jobId=" + jobId);

        if (request.action() == BulkAction.CHANGE_PLAN && request.targetPlanId() != null) {
            for (String userId : request.userIds()) {
                changeUserPlan(userId, new AdminUserPlanChangeRequest(request.targetPlanId(), request.reason()));
            }
            return new AdminUserBulkActionData(request.userIds().size(), 0, jobId);
        }

        if (request.action() == BulkAction.SEND_NOTICE && request.notice() != null) {
            userRestClient.post()
                    .uri("/internal/v1/users/notifications/bulk")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "userIds", request.userIds(),
                            "type", "ADMIN_NOTICE",
                            "title", request.notice().title(),
                            "body", request.notice().body(),
                            "sentByAdminUserId", adminUserId,
                            "sentByAdminName", adminName
                    ))
                    .retrieve()
                    .toBodilessEntity();
            return new AdminUserBulkActionData(request.userIds().size(), 0, jobId);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("userIds", request.userIds());
        body.put("action", request.action().name());
        if (request.reason() != null) {
            body.put("reason", request.reason());
        }
        if (request.suspendedDays() != null) {
            body.put("suspendedDays", request.suspendedDays());
        }

        userRestClient.post()
                .uri("/internal/v1/users/bulk-actions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();

        return new AdminUserBulkActionData(request.userIds().size(), 0, jobId);
    }

    public AdminSupportTicketsData listTickets(SupportStatus status) {
        String statusParam = toInternalSupportStatus(status);
        List<InternalTicketDto> tickets = userRestClient.get()
                .uri(builder -> builder.path("/internal/v1/support/tickets")
                        .queryParam("status", statusParam)
                        .build())
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalTicketDto>>() {});

        if (tickets == null) {
            tickets = Collections.emptyList();
        }

        return new AdminSupportTicketsData(tickets.stream().map(this::mapTicket).toList());
    }

    public AdminSupportTicketData getTicket(String ticketId) {
        InternalTicketDto ticket = userRestClient.get()
                .uri("/internal/v1/support/tickets/{ticketId}", ticketId)
                .retrieve()
                .body(InternalTicketDto.class);

        if (ticket == null) {
            throw new IllegalArgumentException("Ticket not found: " + ticketId);
        }

        return new AdminSupportTicketData(mapTicket(ticket));
    }

    @Transactional
    public AdminSupportTicketData updateTicket(String ticketId, AdminSupportTicketUpdateRequest request) {
        recordOperation("SUPPORT_TICKET_UPDATE", "SUPPORT_TICKET", ticketId, "status=" + request.status());

        InternalTicketDto updated = userRestClient.patch()
                .uri("/internal/v1/support/tickets/{ticketId}", ticketId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "status", valueOr(toInternalSupportStatus(request.status()), ""),
                        "assigneeAdminUserId", valueOr(request.assigneeAdminUserId(), "")
                ))
                .retrieve()
                .body(InternalTicketDto.class);

        return new AdminSupportTicketData(mapTicket(updated));
    }

    @Transactional
    public SupportReplyData replyTicket(String ticketId, SupportReplyCreateRequest request, String adminUserId, String adminName) {
        SupportReplyData reply = new SupportReplyData("RPL-" + UUID.randomUUID(), ticketId, adminUserId, OffsetDateTime.now());
        recordOperation("SUPPORT_TICKET_REPLY", "SUPPORT_TICKET", ticketId, "replyId=" + reply.replyId());

        userRestClient.post()
                .uri("/internal/v1/support/tickets/{ticketId}/replies", ticketId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "body", request.body(),
                        "adminUserId", adminUserId,
                        "adminName", adminName
                ))
                .retrieve()
                .toBodilessEntity();

        return reply;
    }

    @Transactional
    public void deleteTicket(String ticketId) {
        recordOperation("SUPPORT_TICKET_DELETE", "SUPPORT_TICKET", ticketId, null);
        userRestClient.delete()
                .uri("/internal/v1/support/tickets/{ticketId}", ticketId)
                .retrieve()
                .toBodilessEntity();
    }

    public AdminBillingSummaryData billingSummary() {
        try {
            AdminBillingSummaryData summary = commerceRestClient.get()
                    .uri("/internal/v1/billing/summary")
                    .retrieve()
                    .body(AdminBillingSummaryData.class);
            return summary != null ? summary : new AdminBillingSummaryData(BigDecimal.ZERO, 0, BigDecimal.ZERO, 0);
        } catch (RuntimeException exception) {
            log.warn("Falling back to empty billing summary: {}", exception.getMessage());
            return new AdminBillingSummaryData(BigDecimal.ZERO, 0, BigDecimal.ZERO, 0);
        }
    }

    private TrendSeriesData fetchRevenueTrend(BigDecimal currentRevenue, int days) {
        try {
            InternalTrendSeriesDto trend = commerceRestClient.get()
                    .uri("/internal/v1/billing/revenue-trend?days=" + days)
                    .retrieve()
                    .body(InternalTrendSeriesDto.class);
            return trend != null ? toTrendSeriesData(trend) : buildRevenueTrend(currentRevenue);
        } catch (Exception exception) {
            log.warn("Falling back to snapshot revenue trend: {}", exception.getMessage());
            return buildRevenueTrend(currentRevenue);
        }
    }

    InternalUserGrowthSummaryDto fetchUserGrowthSummary(int days) {
        try {
            return userRestClient.get()
                    .uri("/internal/v1/users/growth-summary?days=" + days)
                    .retrieve()
                    .body(InternalUserGrowthSummaryDto.class);
        } catch (Exception exception) {
            log.warn("Falling back to snapshot user growth trend: {}", exception.getMessage());
            return null;
        }
    }

    private InternalWorkspaceMonitoringSummaryDto fetchWorkspaceMonitoringSummary() {
        try {
            InternalApiEnvelope<InternalWorkspaceMonitoringSummaryDto> envelope = workspaceRestClient.get()
                    .uri("/internal/v1/workspace/monitoring/summary")
                    .retrieve()
                    .body(new ParameterizedTypeReference<InternalApiEnvelope<InternalWorkspaceMonitoringSummaryDto>>() {});
            InternalWorkspaceMonitoringSummaryDto summary = envelope != null ? envelope.data() : null;
            return summary != null ? summary : new InternalWorkspaceMonitoringSummaryDto(0, 0L, 0, List.of());
        } catch (Exception exception) {
            log.warn("Falling back to empty workspace monitoring summary: {}", exception.getMessage());
            return new InternalWorkspaceMonitoringSummaryDto(0, 0L, 0, List.of());
        }
    }

    public AdminPaymentsData listPayments(PaymentStatus status, PlanId planId, int page, int size) {
        List<InternalPaymentDto> payments;
        try {
            payments = commerceRestClient.get()
                    .uri("/internal/v1/billing/payments")
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalPaymentDto>>() {});
        } catch (RuntimeException exception) {
            log.warn("Falling back to empty admin payment list: {}", exception.getMessage());
            payments = Collections.emptyList();
        }

        if (payments == null) {
            payments = Collections.emptyList();
        }

        Map<String, InternalUserDto> usersById = new java.util.HashMap<>(userMap());

        List<AdminPaymentRow> rows = payments.stream()
                .sorted(Comparator.comparing(InternalPaymentDto::paidAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .collect(Collectors.toMap(
                        payment -> normalizedUserId(payment.userId()) + "|" + valueOr(payment.planId(), "") + "|" + (payment.amount() != null ? payment.amount().toPlainString() : "0"),
                        payment -> payment,
                        (left, right) -> left,
                        java.util.LinkedHashMap::new
                ))
                .values()
                .stream()
                .map(payment -> mapPayment(payment, resolveUser(normalizedUserId(payment.userId()), usersById)))
                .filter(payment -> status == null || payment.status() == status)
                .filter(payment -> planId == null || payment.planId() == planId)
                .toList();

        return new AdminPaymentsData(rows, new PaginationData(page, size, rows.size(), 1));
    }

    @Transactional
    public AdminPaymentActionData refundPayment(String paymentId, AdminPaymentRefundRequest request) {
        recordOperation("PAYMENT_REFUND_REQUEST", "PAYMENT", paymentId, null);

        InternalPaymentDto payment = listInternalPayments().stream()
                .filter(candidate -> paymentId.equals(candidate.paymentId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));

        Map<String, InternalUserDto> usersById = new java.util.HashMap<>(userMap());
        InternalUserDto user = resolveUser(normalizedUserId(payment.userId()), usersById);

        try {
            commerceRestClient.post()
                    .uri("/internal/v1/billing/payments/{paymentId}/refund", paymentId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request == null ? new AdminPaymentRefundRequest(null, null) : request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException exception) {
            throw mapCommerceClientException(exception);
        }

        OffsetDateTime refundedAt = OffsetDateTime.now();
        refundNotificationService.sendRefundCompletedMail(
                user == null ? null : user.email(),
                displayName(user, normalizedUserId(payment.userId())),
                payment.paymentId(),
                payment.planId(),
                request != null && request.amount() != null ? request.amount() : payment.amount(),
                payment.method(),
                request == null ? null : request.reason(),
                refundedAt
        );

        return new AdminPaymentActionData(paymentId, "REFUND_REQUESTED", refundedAt);
    }

    private RuntimeException mapCommerceClientException(HttpClientErrorException exception) {
        String responseBody = exception.getResponseBodyAsString();
        String message = extractErrorMessage(responseBody);
        int statusCode = exception.getStatusCode().value();
        if (statusCode == 400) {
            return com.brainx.admin.exception.AdminAuthException.badRequest(message);
        }
        if (statusCode == 404) {
            return com.brainx.admin.exception.AdminAuthException.notFound(message);
        }
        if (statusCode == 409) {
            return com.brainx.admin.exception.AdminAuthException.conflict(message);
        }
        if (statusCode == 403) {
            return com.brainx.admin.exception.AdminAuthException.forbidden(message);
        }
        return new IllegalStateException(message);
    }

    private String extractErrorMessage(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return "결제 환불 처리 중 오류가 발생했습니다.";
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\"message\"\\s*:\\s*\"([^\"]+)\"").matcher(responseBody);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return responseBody;
    }

    @Transactional
    public AdminPaymentActionData retryPayment(String paymentId) {
        recordOperation("PAYMENT_RETRY_REQUEST", "PAYMENT", paymentId, null);

        commerceRestClient.post()
                .uri("/internal/v1/billing/payments/{paymentId}/retry", paymentId)
                .retrieve()
                .toBodilessEntity();

        return new AdminPaymentActionData(paymentId, "RETRY_REQUESTED", OffsetDateTime.now());
    }

    @Transactional
    public void deletePayment(String paymentId) {
        recordOperation("PAYMENT_DELETE", "PAYMENT", paymentId, null);

        commerceRestClient.delete()
                .uri("/internal/v1/billing/payments/{paymentId}", paymentId)
                .retrieve()
                .toBodilessEntity();
    }

    public AdminSubscriptionsData listSubscriptions() {
        List<InternalSubscriptionDto> subscriptions = listSubscriptionsInternal();
        Map<String, PlanDataDto> plansById = listPlansInternal().stream()
                .collect(Collectors.toMap(PlanDataDto::planId, plan -> plan, (left, right) -> left));
        Map<String, InternalUserDto> usersById = new java.util.HashMap<>(userMap());

        List<AdminSubscriptionRow> rows = subscriptions.stream()
                .filter(subscription -> !"free".equalsIgnoreCase(subscription.planId()))
                .map(subscription -> mapSubscription(subscription, plansById.get(subscription.planId()), resolveUser(normalizedUserId(subscription.userId()), usersById)))
                .toList();

        return new AdminSubscriptionsData(rows);
    }

    @Transactional
    public void deleteSubscription(String subscriptionId) {
        recordOperation("SUBSCRIPTION_DELETE", "SUBSCRIPTION", subscriptionId, null);

        commerceRestClient.delete()
                .uri("/internal/v1/billing/subscriptions/{subscriptionId}", subscriptionId)
                .retrieve()
                .toBodilessEntity();
    }

    public AdminPaymentFailuresData listPaymentFailures() {
        List<InternalPaymentFailureDto> failures;
        try {
            failures = commerceRestClient.get()
                    .uri("/internal/v1/billing/failures")
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalPaymentFailureDto>>() {});
        } catch (RuntimeException exception) {
            log.warn("Falling back to empty payment failure list: {}", exception.getMessage());
            failures = Collections.emptyList();
        }

        if (failures == null) {
            failures = Collections.emptyList();
        }

        Map<String, InternalUserDto> usersById = new java.util.HashMap<>(userMap());

        List<AdminPaymentFailureRow> rows = failures.stream()
                .map(failure -> mapPaymentFailure(failure, resolveUser(normalizedUserId(failure.userId()), usersById)))
                .toList();

        return new AdminPaymentFailuresData(rows);
    }

    public AdminPlansData listPlans() {
        List<AdminPlanData> plans = listPlansInternal().stream()
                .map(plan -> new AdminPlanData(
                        toPlanId(plan.planId()),
                        plan.name(),
                        plan.price(),
                        plan.currency(),
                        valueOr(plan.description(), ""),
                        plan.effectiveAt() != null ? plan.effectiveAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
                ))
                .toList();

        return new AdminPlansData(plans);
    }

    @Transactional
    public AdminPlanData updatePlanPrice(PlanId planId, AdminPlanPriceUpdateRequest request) {
        recordOperation("PLAN_PRICE_UPDATE", "PLAN", planId.name(), "price=" + request.price() + ", applyTiming=" + request.applyTiming());

        PlanDataDto plan = commerceRestClient.patch()
                .uri("/internal/v1/plans/{planId}", planId.name())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("price", request.price(), "currency", request.currency() != null ? request.currency() : "KRW"))
                .retrieve()
                .body(PlanDataDto.class);

        if (plan == null) {
            throw new IllegalArgumentException("Plan update failed: " + planId);
        }

        return new AdminPlanData(
                planId,
                plan.name(),
                plan.price(),
                plan.currency(),
                valueOr(plan.description(), ""),
                plan.effectiveAt() != null ? plan.effectiveAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
        );
    }

    public AdminTokenUsageData tokenUsage() {
        return new AdminTokenUsageData(List.of(Map.of("modelId", "gpt-4.1", "tokens", 1242000)), new BigDecimal("37.12"));
    }

    private List<InternalSubscriptionDto> listSubscriptionsInternal() {
        try {
            List<InternalSubscriptionDto> list = commerceRestClient.get()
                    .uri("/internal/v1/billing/subscriptions")
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalSubscriptionDto>>() {});
            return list != null ? list : Collections.emptyList();
        } catch (RuntimeException exception) {
            log.warn("Falling back to empty subscription list: {}", exception.getMessage());
            return Collections.emptyList();
        }
    }

    private List<PlanDataDto> listPlansInternal() {
        PlanApiResponse response = commerceRestClient.get()
                .uri("/api/v1/plans")
                .retrieve()
                .body(PlanApiResponse.class);

        if (response == null || response.data() == null || response.data().plans() == null) {
            return Collections.emptyList();
        }

        return response.data().plans().stream()
                .map(plan -> new PlanDataDto(
                        plan.planId(),
                        plan.name(),
                        BigDecimal.valueOf(plan.price()),
                        plan.currency(),
                        planDescription(plan.planId()),
                        null
                ))
                .toList();
    }

    private Map<String, String> resolveUserPlans() {
        Map<String, String> plansByUser = listSubscriptionsInternal().stream()
                .filter(subscription -> subscription.status() == null
                        || "ACTIVE".equals(subscription.status())
                        || "FREE".equals(subscription.status()))
                .collect(Collectors.toMap(
                        InternalSubscriptionDto::userId,
                        InternalSubscriptionDto::planId,
                        this::preferHigherPlan
                ));

        List<InternalPaymentDto> payments;
        try {
            payments = commerceRestClient.get()
                    .uri("/internal/v1/billing/payments")
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalPaymentDto>>() {});
        } catch (RuntimeException exception) {
            log.warn("Falling back to subscription-only user plan resolution: {}", exception.getMessage());
            payments = Collections.emptyList();
        }

        if (payments != null) {
            payments.stream()
                    .filter(payment -> payment.userId() != null)
                    .filter(payment -> payment.planId() != null)
                    .filter(payment -> payment.failureReason() == null || payment.failureReason().isBlank())
                    .filter(payment -> "SUCCEEDED".equals(payment.status()) || "SUCCESS".equals(payment.status()))
                    .forEach(payment -> plansByUser.merge(payment.userId(), payment.planId(), this::preferHigherPlan));
        }

        return plansByUser;
    }

    private AdminUserRow mapUserRow(
            InternalUserDto user,
            String rawPlanId,
            InternalUserWorkspaceStatsDto workspaceStats,
            List<AdminUserLoginSession> sessions
    ) {
        PlanId planId = toPlanId(rawPlanId);
        ManagedUserStatus userStatus = toManagedStatus(user.status());
        OffsetDateTime joinedAt = toOffset(user.createdAt(), BASE);
        AdminUserLoginSession lastLogin = sessions != null && !sessions.isEmpty()
                ? sessions.stream().max(Comparator.comparing(AdminUserLoginSession::lastSeenAt)).orElse(null)
                : buildLoginSession(user, joinedAt);
        OffsetDateTime lastActiveAt = resolveLastActiveAt(user, joinedAt, lastLogin);

        return new AdminUserRow(
                user.userId(),
                displayName(user, user.userId()),
                valueOr(user.email(), ""),
                planId,
                userStatus,
                workspaceStats.noteCount(),
                workspaceStats.storageBytes(),
                joinedAt,
                lastActiveAt,
                lastLogin,
                buildActivities(user, lastActiveAt)
        );
    }

    private OffsetDateTime resolveLastActiveAt(InternalUserDto user, OffsetDateTime joinedAt, AdminUserLoginSession lastLogin) {
        if (lastLogin != null && lastLogin.lastSeenAt() != null) {
            return lastLogin.lastSeenAt();
        }
        if (user.lastLoginAt() != null) {
            return toOffset(user.lastLoginAt(), joinedAt);
        }
        return toOffset(user.updatedAt(), joinedAt);
    }

    private AdminPaymentRow mapPayment(InternalPaymentDto payment, InternalUserDto user) {
        String userId = normalizedUserId(payment.userId());
        return new AdminPaymentRow(
                payment.paymentId(),
                payment.transactionId(),
                userId,
                displayName(user, userId),
                toPlanId(payment.planId()),
                payment.amount(),
                payment.currency(),
                payment.method(),
                toPaymentStatus(payment.status(), payment.failureReason()),
                payment.paidAt() != null ? payment.paidAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
        );
    }

    private AdminSubscriptionRow mapSubscription(InternalSubscriptionDto subscription, PlanDataDto plan, InternalUserDto user) {
        String userId = normalizedUserId(subscription.userId());
        String userName = displayName(user, userId);
        String initial = userName.isBlank() ? "U" : userName.substring(0, 1);
        return new AdminSubscriptionRow(
                subscription.subscriptionId(),
                userId,
                userName,
                initial,
                toPlanId(subscription.planId()),
                subscription.startedAt() != null ? subscription.startedAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE,
                subscription.nextBillingAt() != null ? subscription.nextBillingAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE,
                plan != null ? plan.price() : BigDecimal.ZERO,
                plan != null ? plan.currency() : "KRW"
        );
    }

    private AdminPaymentFailureRow mapPaymentFailure(InternalPaymentFailureDto failure, InternalUserDto user) {
        String userId = normalizedUserId(failure.userId());
        return new AdminPaymentFailureRow(
                failure.paymentId(),
                userId,
                displayName(user, userId),
                toPlanId(failure.planId()),
                failure.amount(),
                failure.currency(),
                failure.reason(),
                failure.retryCount(),
                failure.failedAt() != null ? failure.failedAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
        );
    }

    private SupportTicketData mapTicket(InternalTicketDto ticket) {
        SupportStatus status = SupportStatus.OPEN;
        if ("IN_PROGRESS".equals(ticket.status())) {
            status = SupportStatus.IN_PROGRESS;
        } else if ("ANSWERED".equals(ticket.status())) {
            status = SupportStatus.RESOLVED;
        } else if ("CLOSED".equals(ticket.status())) {
            status = SupportStatus.CLOSED;
        }

        OffsetDateTime created = ticket.createdAt() != null ? ticket.createdAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE;
        return new SupportTicketData(
                ticket.ticketId(),
                ticket.userId(),
                valueOr(ticket.userName(), ticket.userId()),
                valueOr(ticket.email(), ""),
                status,
                ticket.category(),
                ticket.subject(),
                created,
                ticket.assigneeAdminUserId(),
                ticket.assigneeAdminName(),
                ticket.urgent(),
                valueOr(ticket.body(), ""),
                ticket.replyContent(),
                ticket.repliedAt() != null ? ticket.repliedAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : null
        );
    }

    private String preferHigherPlan(String left, String right) {
        return planRank(right) > planRank(left) ? right : left;
    }

    private int planRank(String planId) {
        return switch (toPlanId(planId)) {
            case max -> 3;
            case pro -> 2;
            case free -> 1;
        };
    }

    private Map<String, InternalUserDto> userMap() {
        List<InternalUserDto> users = userRestClient.get()
                .uri("/internal/v1/users")
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalUserDto>>() {});

        if (users == null) {
            return Collections.emptyMap();
        }

        return users.stream().collect(Collectors.toMap(InternalUserDto::userId, user -> user, (left, right) -> left));
    }

    private InternalUserDto resolveUser(String userId, Map<String, InternalUserDto> usersById) {
        String normalized = normalizedUserId(userId);
        if (normalized.isBlank()) {
            return null;
        }
        InternalUserDto cached = usersById.get(normalized);
        if (cached != null) {
            return cached;
        }
        try {
            InternalUserDto fetched = userRestClient.get()
                    .uri("/internal/v1/users/{userId}", normalized)
                    .retrieve()
                    .body(InternalUserDto.class);
            if (fetched != null) {
                usersById.put(normalized, fetched);
            }
            return fetched;
        } catch (Exception ignored) {
            return null;
        }
    }

    private int countActiveUsers() {
        return (int) userMap().values().stream()
                .filter(user -> user.status() == UserStatusType.ACTIVE)
                .count();
    }

    int resolveLiveActiveUsers() {
        return countActiveUsers();
    }

    private List<LogData> buildDashboardLogs(InternalWorkspaceMonitoringSummaryDto workspaceSummary) {
        List<DashboardLogEntry> entries = new ArrayList<>();
        operationEvents.findTop20ByOrderByCreatedAtDesc().forEach(event -> entries.add(new DashboardLogEntry(
                event.getCreatedAt(),
                new LogData(
                        logLevel(event.getAction()),
                        event.getTargetType(),
                        buildLogMessage(event),
                        event.getCreatedAt().toLocalTime().withNano(0).toString()
                )
        )));

        workspaceSummary.recentActivities().forEach(activity -> {
            OffsetDateTime occurredAt = activity.occurredAt() != null
                    ? activity.occurredAt().atZone(ZoneId.systemDefault()).toOffsetDateTime()
                    : OffsetDateTime.now();
            entries.add(new DashboardLogEntry(
                    occurredAt,
                    new LogData(
                            "INFO",
                            "Workspace-Service",
                            workspaceActivityMessage(activity),
                            occurredAt.toLocalTime().withNano(0).toString()
                    )
            ));
        });

        return entries.stream()
                .sorted(Comparator.comparing(DashboardLogEntry::occurredAt).reversed())
                .limit(8)
                .map(DashboardLogEntry::data)
                .toList();
    }

    private TrendSeriesData buildRevenueTrend(BigDecimal currentRevenue) {
        List<AdminMonitoringSnapshot> snapshots = safeFindAllMonitoringSnapshots();
        List<Integer> values = snapshots.stream()
                .sorted(Comparator.comparing(AdminMonitoringSnapshot::getCapturedAt))
                .map(snapshot -> snapshot.getMonthlyRevenue().intValue())
                .skip(Math.max(0, snapshots.size() - 13L))
                .collect(Collectors.toCollection(ArrayList::new));
        values.add(currentRevenue.intValue());
        return new TrendSeriesData(
                "monthlyRevenue",
                normalizeTrend(values),
                "최근 14회 스냅샷",
                14,
                "Asia/Seoul",
                "AdminMonitoringSnapshot + Commerce-Service"
        );
    }

    private TrendSeriesData buildActiveUserTrend(int activeUsers) {
        List<AdminMonitoringSnapshot> snapshots = safeFindAllMonitoringSnapshots();
        List<Integer> values = snapshots.stream()
                .sorted(Comparator.comparing(AdminMonitoringSnapshot::getCapturedAt))
                .map(AdminMonitoringSnapshot::getActiveUsers)
                .skip(Math.max(0, snapshots.size() - 13L))
                .collect(Collectors.toCollection(ArrayList::new));
        values.add(activeUsers);
        return new TrendSeriesData(
                "activeUsers",
                normalizeTrend(values),
                "최근 14회 스냅샷",
                14,
                "Asia/Seoul",
                "AdminMonitoringSnapshot + User-Service"
        );
    }

    private TrendSeriesData buildOverviewActiveUserTrend(OffsetDateTime capturedAt, int activeUsers) {
        SnapshotWindow today = snapshotWindow(capturedAt);
        Map<LocalDate, Integer> activeUsersBySnapshotDate = new HashMap<>();

        for (AdminMonitoringSnapshot snapshot : safeFindAllMonitoringSnapshotsDesc()) {
            LocalDate snapshotDate = snapshotWindow(snapshot.getCapturedAt()).snapshotDate();
            activeUsersBySnapshotDate.putIfAbsent(snapshotDate, snapshot.getActiveUsers());
        }

        Integer todaySnapshotValue = activeUsersBySnapshotDate.get(today.snapshotDate());
        int todayValue = todaySnapshotValue != null ? todaySnapshotValue : activeUsers;

        List<Integer> values = new ArrayList<>(OVERVIEW_TREND_DAYS);
        LocalDate startDate = today.snapshotDate().minusDays(OVERVIEW_TREND_DAYS - 1L);
        for (int i = 0; i < OVERVIEW_TREND_DAYS - 1; i++) {
            values.add(activeUsersBySnapshotDate.getOrDefault(startDate.plusDays(i), 0));
        }
        values.add(todayValue);

        String source = todaySnapshotValue != null
                ? "AdminMonitoringSnapshot"
                : "AdminMonitoringSnapshot + User-Service live overlay";

        return new TrendSeriesData(
                "activeUsers",
                values,
                "최근 13일 snapshot + 오늘 실시간 활성 회원 수",
                OVERVIEW_TREND_DAYS,
                monitoringZoneId().getId(),
                source
        );
    }

    private DesktopDownloadSummary desktopDownloadSummary(OffsetDateTime capturedAt) {
        List<AdminDesktopDownloadEvent> events = desktopDownloadEventRepository.findAllByOrderByDownloadedAtDesc();
        List<AdminMonitoringSnapshot> monitoringSnapshots = safeFindAllMonitoringSnapshotsDesc();
        if (events.isEmpty() && monitoringSnapshots.isEmpty()) {
            return new DesktopDownloadSummary(
                    0,
                    0,
                    new TrendSeriesData(
                            "desktopDownloadCount",
                            List.of(0),
                            "최근 다운로드 데이터 없음",
                            1,
                            monitoringZoneId().getId(),
                            "AdminDesktopDownloadEvent"
                    )
            );
        }

        LinkedHashSet<String> uniqueDownloaders = new LinkedHashSet<>();
        for (AdminDesktopDownloadEvent event : events) {
            uniqueDownloaders.add(downloadIdentityKey(event));
        }

        Map<LocalDate, Integer> downloadCountsBySnapshotDate = new HashMap<>();
        for (AdminMonitoringSnapshot snapshot : monitoringSnapshots) {
            LocalDate snapshotDate = snapshotWindow(snapshot.getCapturedAt()).snapshotDate();
            downloadCountsBySnapshotDate.putIfAbsent(snapshotDate, snapshot.getDesktopDownloadCount());
        }

        SnapshotWindow today = snapshotWindow(capturedAt);
        Integer todaySnapshotValue = downloadCountsBySnapshotDate.get(today.snapshotDate());
        int todayValue = todaySnapshotValue != null ? todaySnapshotValue : events.size();
        LocalDate startDate = today.snapshotDate().minusDays(DOWNLOAD_TREND_DAYS - 1L);
        List<Integer> values = new ArrayList<>(DOWNLOAD_TREND_DAYS);
        for (int i = 0; i < DOWNLOAD_TREND_DAYS - 1; i++) {
            values.add(downloadCountsBySnapshotDate.getOrDefault(startDate.plusDays(i), 0));
        }
        values.add(todayValue);

        String source = todaySnapshotValue != null
                ? "AdminMonitoringSnapshot"
                : "AdminMonitoringSnapshot + Landing live overlay";

        return new DesktopDownloadSummary(
                uniqueDownloaders.size(),
                events.size(),
                new TrendSeriesData(
                        "desktopDownloadCount",
                        values,
                        "최근 6일 snapshot + 오늘 Windows 다운로드 누적",
                        DOWNLOAD_TREND_DAYS,
                        monitoringZoneId().getId(),
                        source
                )
        );
    }

    private TrendSeriesData toTrendSeriesData(InternalTrendSeriesDto trend) {
        return new TrendSeriesData(
                trend.metric(),
                trend.values(),
                trend.periodLabel(),
                trend.pointCount(),
                trend.timezone(),
                trend.source()
        );
    }

    private List<Integer> normalizeTrend(List<Integer> values) {
        if (values.isEmpty()) {
            return List.of(0);
        }
        while (values.size() < 14) {
            values.add(0, values.get(0));
        }
        return values;
    }

    private Integer latestTrendValue(InternalTrendSeriesDto trend) {
        if (trend == null || trend.values() == null || trend.values().isEmpty()) {
            return null;
        }
        return trend.values().get(trend.values().size() - 1);
    }

    private String downloadIdentityKey(AdminDesktopDownloadEvent event) {
        if (event.getClientKeyHash() != null && !event.getClientKeyHash().isBlank()) {
            return event.getClientKeyHash();
        }
        if (event.getIpAddress() != null && !event.getIpAddress().isBlank()) {
            return event.getIpAddress() + "|" + (event.getUserAgentHash() != null ? event.getUserAgentHash() : "");
        }
        if (event.getUserAgentHash() != null && !event.getUserAgentHash().isBlank()) {
            return event.getUserAgentHash();
        }
        return event.getDownloadId();
    }

    private String normalizeIpAddress(String ipAddress) {
        if (ipAddress == null) {
            return null;
        }
        String normalized = ipAddress.trim();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private String sha256(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte element : hash) {
                builder.append(String.format(Locale.ROOT, "%02x", element));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to hash desktop download value", exception);
        }
    }

    /* private List<KpiData> buildOverviewKpis(AdminBillingSummaryData summary, SnapshotDelta delta) {
        return List.of(
                new KpiData("?대쾲 ??留ㅼ텧", formatMoney(summary.monthlyRevenue()), formatDelta(delta.monthlyRevenueDelta()), toneForGrowth(delta.monthlyRevenueDelta()), "직전 snapshot 대비"),
                new KpiData("?쒖꽦 援щ룆", String.valueOf(summary.activeSubscriptions()), formatDelta(delta.activeSubscriptionsDelta()), toneForGrowth(delta.activeSubscriptionsDelta()), "직전 snapshot 대비"),
                new KpiData("MRR", formatMoney(summary.mrr()), formatDelta(delta.mrrDelta()), toneForGrowth(delta.mrrDelta()), "직전 snapshot 대비"),
                new KpiData("寃곗젣 ?ㅽ뙣", String.valueOf(summary.failedPaymentCount()), formatDelta(delta.failedPaymentCountDelta()), toneForInverseMetric(delta.failedPaymentCountDelta()), "직전 snapshot 대비")
        );
    }

    } */

    private List<KpiData> buildOverviewKpisLive(AdminBillingSummaryData summary, int activeUsers, int desktopDownloadUsers, SnapshotDelta delta) {
        return List.of(
                new KpiData("\uC774\uBC88 \uB2EC \uB9E4\uCD9C", formatMoney(summary.monthlyRevenue()), formatDeltaText(delta.monthlyRevenueDelta()), toneForGrowth(delta.monthlyRevenueDelta()), "\uC9C1\uC804 snapshot \uB300\uBE44"),
                new KpiData("\uD65C\uC131 \uAD6C\uB3C5", String.valueOf(summary.activeSubscriptions()), formatDeltaText(delta.activeSubscriptionsDelta()), toneForGrowth(delta.activeSubscriptionsDelta()), "\uC9C1\uC804 snapshot \uB300\uBE44"),
                new KpiData("MRR", formatMoney(summary.mrr()), formatDeltaText(delta.mrrDelta()), toneForGrowth(delta.mrrDelta()), "\uC9C1\uC804 snapshot \uB300\uBE44"),
                new KpiData("\uD65C\uC131 \uC0AC\uC6A9\uC790", String.valueOf(activeUsers), formatDeltaText(delta.activeUsersDelta()), toneForGrowth(delta.activeUsersDelta()), "User-Service \uC9C1\uACC4"),
                new KpiData("\uC571 \uB2E4\uC6B4\uB85C\uB4DC \uC0AC\uC6A9\uC790", String.valueOf(desktopDownloadUsers), formatDeltaText(delta.desktopDownloadUsersDelta()), toneForGrowth(delta.desktopDownloadUsersDelta()), "Landing \uB2E4\uC6B4\uB85C\uB4DC \uB204\uC801"),
                new KpiData("\uACB0\uC81C \uC2E4\uD328", String.valueOf(summary.failedPaymentCount()), formatDeltaText(delta.failedPaymentCountDelta()), toneForInverseMetric(delta.failedPaymentCountDelta()), "\uC9C1\uC804 snapshot \uB300\uBE44")
        );
    }

    private SnapshotDelta snapshotDelta() {
        List<AdminMonitoringSnapshot> snapshots = safeFindTop2MonitoringSnapshots();
        if (snapshots.size() < 2) {
            return new SnapshotDelta(null, null, null, null, null, null);
        }

        AdminMonitoringSnapshot latest = snapshots.get(0);
        AdminMonitoringSnapshot previous = snapshots.get(1);
        return new SnapshotDelta(
                percentChange(latest.getMonthlyRevenue(), previous.getMonthlyRevenue()),
                percentChange(BigDecimal.valueOf(latest.getActiveSubscriptions()), BigDecimal.valueOf(previous.getActiveSubscriptions())),
                percentChange(latest.getMrr(), previous.getMrr()),
                percentChange(BigDecimal.valueOf(latest.getActiveUsers()), BigDecimal.valueOf(previous.getActiveUsers())),
                percentChange(BigDecimal.valueOf(latest.getDesktopDownloadUsers()), BigDecimal.valueOf(previous.getDesktopDownloadUsers())),
                percentChange(BigDecimal.valueOf(latest.getFailedPaymentCount()), BigDecimal.valueOf(previous.getFailedPaymentCount()))
        );
    }

    private Double percentChange(BigDecimal current, BigDecimal previous) {
        if (current == null || previous == null) {
            return null;
        }
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            if (current.compareTo(BigDecimal.ZERO) == 0) {
                return 0d;
            }
            return 100d;
        }
        return current.subtract(previous)
                .multiply(BigDecimal.valueOf(100))
                .divide(previous.abs(), 1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private List<AdminMonitoringSnapshot> safeFindAllMonitoringSnapshots() {
        try {
            return monitoringSnapshotRepository.findAll();
        } catch (RuntimeException exception) {
            return handleMonitoringSnapshotAccessFailure("findAll", exception);
        }
    }

    private List<AdminMonitoringSnapshot> safeFindAllMonitoringSnapshotsDesc() {
        try {
            return monitoringSnapshotRepository.findAllByOrderByCapturedAtDesc();
        } catch (RuntimeException exception) {
            return handleMonitoringSnapshotAccessFailure("findAllByOrderByCapturedAtDesc", exception);
        }
    }

    private List<AdminMonitoringSnapshot> safeFindTop2MonitoringSnapshots() {
        try {
            return monitoringSnapshotRepository.findTop2ByOrderByCapturedAtDesc();
        } catch (RuntimeException exception) {
            return handleMonitoringSnapshotAccessFailure("findTop2ByOrderByCapturedAtDesc", exception);
        }
    }

    private List<AdminMonitoringSnapshot> handleMonitoringSnapshotAccessFailure(String operation, RuntimeException exception) {
        if (exception instanceof DataAccessException || exception.getCause() instanceof org.hibernate.exception.SQLGrammarException) {
            log.warn("Monitoring snapshot repository operation {} failed, falling back to live-only metrics: {}", operation, exception.getMessage());
            return List.of();
        }
        throw exception;
    }

    private String formatDelta(Double value) {
        if (value == null) {
            return "기준 없음";
        }
        if (Math.abs(value) < 0.05d) {
            return "0.0%";
        }
        return String.format(Locale.ROOT, "%+.1f%%", value);
    }

    private String formatDeltaText(Double value) {
        if (value == null) {
            return "\uAE30\uC900 \uC5C6\uC74C";
        }
        if (Math.abs(value) < 0.05d) {
            return "0.0%";
        }
        return String.format(Locale.ROOT, "%+.1f%%", value);
    }

    private String toneForGrowth(Double value) {
        if (value == null || value >= 0d) {
            return "good";
        }
        return "bad";
    }

    private String toneForInverseMetric(Double value) {
        if (value == null || value <= 0d) {
            return "good";
        }
        return "bad";
    }

    private double calculateUptimePercent(String serviceName, ServiceHealthState currentState) {
        List<AdminServiceHealthSnapshot> history = healthSnapshotRepository.findTop20ByServiceNameOrderByCapturedAtDesc(serviceName);
        int successfulCount = isAvailableState(currentState.name()) ? 1 : 0;
        for (AdminServiceHealthSnapshot snapshot : history) {
            if (isAvailableState(snapshot.getState())) {
                successfulCount++;
            }
        }
        int sampleCount = Math.min(HEALTH_UPTIME_SAMPLE_SIZE, history.size() + 1);
        if (sampleCount <= 0) {
            return isAvailableState(currentState.name()) ? 100d : 0d;
        }
        return BigDecimal.valueOf(successfulCount)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(sampleCount), 1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private boolean isAvailableState(String state) {
        return ServiceHealthState.UP.name().equalsIgnoreCase(state)
                || ServiceHealthState.DEGRADED.name().equalsIgnoreCase(state);
    }

    private String normalizeHealthState(String state) {
        if (state == null || state.isBlank()) {
            return ServiceHealthState.DOWN.name();
        }
        if ("ok".equalsIgnoreCase(state)) {
            return ServiceHealthState.UP.name();
        }
        if ("warn".equalsIgnoreCase(state)) {
            return ServiceHealthState.DEGRADED.name();
        }
        return state.toUpperCase(Locale.ROOT);
    }

    private String formatUptimePercent(double value) {
        return String.format(Locale.ROOT, "%.1f%%", value);
    }

    private String formatMoney(BigDecimal value) {
        return "KRW " + value.divide(BigDecimal.valueOf(1_000_000), 1, RoundingMode.HALF_UP) + "M";
    }

    private String buildLogMessage(AdminOperationEvent event) {
        if (event.getDetail() == null || event.getDetail().isBlank()) {
            return event.getAction() + " " + event.getTargetId();
        }
        return event.getAction() + " " + event.getDetail();
    }

    private String logLevel(String action) {
        if (action.contains("DELETE") || action.contains("WITHDRAW")) {
            return "WARN";
        }
        if (action.contains("RETRY") || action.contains("REFUND")) {
            return "ERROR";
        }
        return "INFO";
    }

    private String displayName(InternalUserDto user, String fallbackId) {
        if (user == null) {
            return fallbackId;
        }
        if (user.nickname() != null && !user.nickname().isBlank() && !looksLikeSystemNickname(user.nickname())) {
            return user.nickname();
        }
        if (user.email() != null && !user.email().isBlank()) {
            String localPart = user.email().contains("@") ? user.email().substring(0, user.email().indexOf('@')) : user.email();
            if (!localPart.isBlank()) {
                return localPart;
            }
        }
        return fallbackId;
    }

    private String normalizedUserId(String rawUserId) {
        if (rawUserId == null || rawUserId.isBlank()) {
            return "";
        }
        if (rawUserId.startsWith("AuthenticatedUser[userId=") && rawUserId.endsWith("]")) {
            return rawUserId.substring("AuthenticatedUser[userId=".length(), rawUserId.length() - 1);
        }
        if (rawUserId.startsWith("UsernamePasswordAuthenticationToken[") && rawUserId.contains("principal=")) {
            int start = rawUserId.indexOf("principal=") + "principal=".length();
            int end = rawUserId.indexOf(",", start);
            if (end > start) {
                return rawUserId.substring(start, end);
            }
        }
        return rawUserId;
    }

    private boolean looksLikeSystemNickname(String value) {
        return value.startsWith("AuthenticatedUser[")
                || value.startsWith("UsernamePasswordAuthenticationToken[")
                || value.contains("userId=");
    }

    private OffsetDateTime toOffset(LocalDateTime value, OffsetDateTime fallback) {
        return value != null ? value.atZone(ZoneId.systemDefault()).toOffsetDateTime() : fallback;
    }

    private PlanId toPlanId(String rawPlanId) {
        if (rawPlanId == null) {
            return PlanId.free;
        }
        try {
            return PlanId.valueOf(rawPlanId.toLowerCase());
        } catch (Exception ignored) {
            return PlanId.free;
        }
    }

    private ManagedUserStatus toManagedStatus(UserStatusType status) {
        if (status == null) {
            return ManagedUserStatus.ACTIVE;
        }
        try {
            return ManagedUserStatus.valueOf(status.name());
        } catch (Exception ignored) {
            return ManagedUserStatus.ACTIVE;
        }
    }

    private PaymentStatus toPaymentStatus(String status, String failureReason) {
        if ("REFUNDED".equals(status)) {
            return PaymentStatus.REFUNDED;
        }
        if (failureReason != null && failureReason.contains("Refunded by Admin")) {
            return PaymentStatus.REFUNDED;
        }
        if (status == null) {
            return PaymentStatus.SUCCESS;
        }
        if ("CANCELLED".equals(status)) {
            return PaymentStatus.CANCELED;
        }
        try {
            return PaymentStatus.valueOf(status);
        } catch (Exception ignored) {
            return PaymentStatus.SUCCESS;
        }
    }

    private String toInternalSupportStatus(SupportStatus status) {
        if (status == null) {
            return null;
        }
        return switch (status) {
            case OPEN -> "RECEIVED";
            case IN_PROGRESS -> "IN_PROGRESS";
            case RESOLVED -> "ANSWERED";
            case CLOSED -> "CLOSED";
        };
    }

    private List<AdminUserLoginSession> loadLoginSessions(String userId) {
        List<InternalUserLoginSessionDto> sessions = userRestClient.get()
                .uri("/internal/v1/users/{userId}/login-sessions", userId)
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalUserLoginSessionDto>>() {});

        if (sessions == null || sessions.isEmpty()) {
            return List.of();
        }

        return sessions.stream()
                .map(this::mapLoginSession)
                .toList();
    }

    private InternalUserWorkspaceStatsDto loadWorkspaceStats(String userId) {
        InternalApiEnvelope<InternalUserWorkspaceStatsDto> envelope = workspaceRestClient.get()
                .uri("/internal/v1/workspace/users/{userId}/stats", userId)
                .retrieve()
                .body(new ParameterizedTypeReference<InternalApiEnvelope<InternalUserWorkspaceStatsDto>>() {});
        InternalUserWorkspaceStatsDto stats = envelope != null ? envelope.data() : null;
        return stats != null ? stats : new InternalUserWorkspaceStatsDto(0, 0L, List.of());
    }

    private AdminUserLoginSession mapLoginSession(InternalUserLoginSessionDto session) {
        return new AdminUserLoginSession(
                session.sessionId(),
                normalizeLoginDeviceLabel(session.device()),
                valueOr(session.location(), "Unknown"),
                valueOr(session.ipAddress(), "127.0.0.1"),
                session.userAgentHash(),
                session.lastSeenAt() != null ? session.lastSeenAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE,
                session.current()
        );
    }

    private AdminUserLoginSession buildLoginSession(InternalUserDto user, OffsetDateTime lastSeenAt) {
        if (user.lastLoginSessionId() != null && !user.lastLoginSessionId().isBlank() && user.lastLoginAt() != null) {
            return new AdminUserLoginSession(
                    user.lastLoginSessionId(),
                    normalizeLoginDeviceLabel(user.lastLoginDevice()),
                    valueOr(user.lastLoginLocation(), "Unknown"),
                    valueOr(user.lastLoginIpAddress(), "127.0.0.1"),
                    user.lastLoginUserAgentHash(),
                    toOffset(user.lastLoginAt(), lastSeenAt),
                    Boolean.TRUE.equals(user.lastLoginCurrent())
            );
        }

        return null;
    }

    private List<AdminUserActivity> buildActivities(InternalUserDto user, OffsetDateTime occurredAt) {
        List<AdminUserActivity> activities = new ArrayList<>();

        operationEvents.findByTargetTypeAndTargetIdOrderByCreatedAtDesc("USER", user.userId())
                .forEach(event -> activities.add(new AdminUserActivity(
                        event.getEventId(),
                        event.getAction(),
                        describeOperation(event),
                        event.getCreatedAt()
                )));

        if (user.deletionScheduledAt() != null) {
            activities.add(new AdminUserActivity(
                    user.userId() + "-deletion",
                    "DELETION_REQUEST",
                    "탈퇴 예정일: " + user.deletionScheduledAt().toLocalDate(),
                    toOffset(user.deletionScheduledAt(), occurredAt)
            ));
        }
        return activities;
    }

    private String describeOperation(AdminOperationEvent event) {
        String detail = event.getDetail();
        return switch (event.getAction()) {
            case "USER_PLAN_CHANGE" -> "관리자가 플랜을 변경함" + (detail != null ? " (" + detail + ")" : "");
            case "USER_STATUS_CHANGE" -> "관리자가 계정 상태를 변경함" + (detail != null ? " (" + detail + ")" : "");
            case "USER_WITHDRAWAL_REQUEST" -> "관리자가 탈퇴 처리를 요청함";
            default -> event.getAction() + (detail != null ? " (" + detail + ")" : "");
        };
    }

    private static String planDescription(String planId) {
        if ("free".equals(planId)) return "무료 100MB · 기본 AI 요약";
        if ("pro".equals(planId)) return "무제한 노트 · 고급 AI · 협업";
        if ("max".equals(planId)) return "작업 · 권한 관리 · 고급 분석";
        return "";
    }

    private String workspaceActivityMessage(InternalWorkspaceActivityDto activity) {
        String title = valueOr(activity.title(), "제목 없는 노트");
        return switch (valueOr(activity.activityType(), "").toLowerCase(Locale.ROOT)) {
            case "created" -> "노트 생성: " + title;
            case "updated" -> "노트 수정: " + title;
            case "viewed" -> "노트 열람: " + title;
            default -> "워크스페이스 활동: " + title;
        };
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String normalizeLoginDeviceLabel(String value) {
        String normalized = valueOr(value, "Unknown / Unknown");
        if ("Browser / Unknown".equalsIgnoreCase(normalized) || "Unknown / Unknown".equalsIgnoreCase(normalized)) {
            return "BrainX App / Desktop";
        }
        if (normalized.toLowerCase(Locale.ROOT).contains("electron")) {
            return "BrainX App / Desktop";
        }
        return normalized;
    }

    private void recordOperation(String action, String targetType, String targetId, String detail) {
        operationEvents.save(new AdminOperationEvent(action, targetType, targetId, "adm_001", detail));
    }

    private static final int KAFKA_LAG_WARNING_THRESHOLD = 1_000;
    private static final int KAFKA_LAG_CRITICAL_THRESHOLD = 5_000;

    private record KafkaLagObservation(Integer messages, String consumerGroupId, KafkaLagState state, String detail) {}
    private record DashboardLogEntry(OffsetDateTime occurredAt, LogData data) {}

    public record InternalTrendSeriesDto(
            String metric,
            List<Integer> values,
            String periodLabel,
            int pointCount,
            String timezone,
            String source
    ) {}

    public record InternalUserGrowthSummaryDto(
            int activeUsers,
            InternalTrendSeriesDto trend
    ) {}

    public record InternalUserDto(
            String userId,
            String email,
            String nickname,
            String role,
            UserStatusType status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            LocalDateTime deletionScheduledAt,
            String deletionReason,
            String lastLoginSessionId,
            LocalDateTime lastLoginAt,
            String lastLoginDevice,
            String lastLoginLocation,
            String lastLoginIpAddress,
            String lastLoginUserAgentHash,
            Boolean lastLoginCurrent
    ) {}

    public record InternalUserLoginSessionDto(
            String sessionId,
            String device,
            String location,
            String ipAddress,
            String userAgentHash,
            LocalDateTime lastSeenAt,
            boolean current
    ) {}

    public record InternalUserWorkspaceStatsDto(
            int noteCount,
            long storageBytes,
            List<InternalUserActivityDto> activities
    ) {}

    public record InternalWorkspaceMonitoringSummaryDto(
            int totalNotes,
            long totalStorageBytes,
            int notesCreatedToday,
            List<InternalWorkspaceActivityDto> recentActivities
    ) {}

    public record InternalApiEnvelope<T>(boolean success, T data, String message) {}

    public record InternalUserActivityDto(
            String noteId,
            String type,
            String title,
            Instant occurredAt
    ) {}

    public record InternalWorkspaceActivityDto(
            String activityId,
            String userId,
            String noteId,
            String title,
            String activityType,
            Instant occurredAt
    ) {}

    public enum UserStatusType {
        ACTIVE, SUSPENDED, WITHDRAWN
    }

    public record InternalTicketDto(
            String ticketId,
            String userId,
            String userName,
            String email,
            String status,
            String category,
            String subject,
            LocalDateTime createdAt,
            String assigneeAdminUserId,
            String assigneeAdminName,
            boolean urgent,
            String body,
            String replyContent,
            LocalDateTime repliedAt
    ) {}

    public record InternalPaymentDto(
            String paymentId,
            String transactionId,
            String userId,
            String planId,
            BigDecimal amount,
            String currency,
            String method,
            String status,
            Instant paidAt,
            String failureReason
    ) {}

    private List<InternalPaymentDto> listInternalPayments() {
        List<InternalPaymentDto> payments = commerceRestClient.get()
                .uri("/internal/v1/billing/payments")
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalPaymentDto>>() {});
        return payments == null ? Collections.emptyList() : payments;
    }

    public record InternalSubscriptionDto(
            String subscriptionId,
            String userId,
            String planId,
            String status,
            Instant startedAt,
            Instant nextBillingAt
    ) {}

    public record PlanDataDto(
            String planId,
            String name,
            BigDecimal price,
            String currency,
            String description,
            Instant effectiveAt
    ) {}

    public record PlanApiResponse(
            boolean success,
            PlansApiData data,
            String message
    ) {}

    public record PlansApiData(
            List<PlanItemDto> plans
    ) {}

    public record PlanItemDto(
            String planId,
            String name,
            long price,
            String currency
    ) {}

    public record InternalPaymentFailureDto(
            String paymentId,
            String userId,
            String planId,
            BigDecimal amount,
            String currency,
            String reason,
            int retryCount,
            Instant failedAt
    ) {}

    private record SnapshotDelta(
            Double monthlyRevenueDelta,
            Double activeSubscriptionsDelta,
            Double mrrDelta,
            Double activeUsersDelta,
            Double desktopDownloadUsersDelta,
            Double failedPaymentCountDelta
    ) {}

    private record DesktopDownloadSummary(
            int desktopDownloadUsers,
            int desktopDownloadCount,
            TrendSeriesData trend
    ) {}
}
