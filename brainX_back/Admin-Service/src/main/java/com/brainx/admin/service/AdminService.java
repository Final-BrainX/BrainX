package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.*;
import com.brainx.admin.entity.AdminMonitoringSnapshot;
import com.brainx.admin.entity.AdminOperationEvent;
import com.brainx.admin.entity.AdminServiceHealthSnapshot;
import com.brainx.admin.repository.AdminMonitoringSnapshotRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.repository.AdminServiceHealthSnapshotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminService {
    private static final OffsetDateTime BASE = OffsetDateTime.now();

    private final RestClient userRestClient;
    private final RestClient commerceRestClient;
    private final RestClient defaultRestClient;

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

    public AdminService(
            RestClient userRestClient,
            RestClient commerceRestClient,
            RestClient defaultRestClient,
            AdminOperationEventRepository operationEvents,
            AdminServiceHealthSnapshotRepository healthSnapshotRepository,
            AdminMonitoringSnapshotRepository monitoringSnapshotRepository
    ) {
        this.userRestClient = userRestClient;
        this.commerceRestClient = commerceRestClient;
        this.defaultRestClient = defaultRestClient;
        this.operationEvents = operationEvents;
        this.healthSnapshotRepository = healthSnapshotRepository;
        this.monitoringSnapshotRepository = monitoringSnapshotRepository;
    }

    public AdminDashboardOverviewData dashboardOverview() {
        AdminBillingSummaryData summary = billingSummary();
        int activeUsers = countActiveUsers();

        List<ServiceHealthData> healths = List.of(
                checkAndRecordHealth("User-Service", userHealthUrl),
                checkAndRecordHealth("Commerce-Service", commerceHealthUrl),
                checkAndRecordHealth("Workspace-Service", workspaceHealthUrl),
                checkAndRecordHealth("Ingestion-Service", ingestionHealthUrl)
        );

        monitoringSnapshotRepository.save(new AdminMonitoringSnapshot(
                summary.monthlyRevenue(),
                summary.activeSubscriptions(),
                summary.mrr(),
                summary.failedPaymentCount(),
                activeUsers,
                OffsetDateTime.now()
        ));

        List<KpiData> kpis = List.of(
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
        );

        return new AdminDashboardOverviewData(
                kpis,
                healths,
                buildDashboardLogs(),
                buildRevenueTrend(summary.monthlyRevenue()),
                buildActiveUserTrend(activeUsers)
        );
    }

    private ServiceHealthData checkAndRecordHealth(String name, String url) {
        long start = System.currentTimeMillis();
        String state = "ok";
        long latencyMs;

        try {
            ResponseEntity<String> response = defaultRestClient.get()
                    .uri(url)
                    .retrieve()
                    .toEntity(String.class);
            latencyMs = System.currentTimeMillis() - start;
            if (!response.getStatusCode().is2xxSuccessful()) {
                state = "warn";
            }
        } catch (Exception e) {
            state = "warn";
            latencyMs = System.currentTimeMillis() - start;
        }

        healthSnapshotRepository.save(new AdminServiceHealthSnapshot(name, state, latencyMs, 99.9, OffsetDateTime.now()));
        return new ServiceHealthData(name, latencyMs + "ms", "99.9%", state);
    }

    public List<AdminMonitoringSnapshot> getMonitoringSnapshots() {
        return monitoringSnapshotRepository.findAll();
    }

    public void deleteMonitoringSnapshot(String id) {
        monitoringSnapshotRepository.deleteById(id);
    }

    public List<AdminServiceHealthSnapshot> getHealthSnapshots() {
        return healthSnapshotRepository.findAll();
    }

    public void deleteHealthSnapshot(String id) {
        healthSnapshotRepository.deleteById(id);
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

        Map<String, String> userPlans = listSubscriptionsInternal().stream()
                .collect(Collectors.toMap(InternalSubscriptionDto::userId, InternalSubscriptionDto::planId, (left, right) -> left));

        List<AdminUserRow> rows = usersFromService.stream()
                .map(user -> mapUserRow(user, userPlans.getOrDefault(user.userId(), "free")))
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

        String userPlan = listSubscriptionsInternal().stream()
                .filter(sub -> sub.userId().equals(userId))
                .map(InternalSubscriptionDto::planId)
                .findFirst()
                .orElse("free");

        AdminUserRow row = mapUserRow(user, userPlan);
        return new AdminUserDetailData(
                row.userId(),
                row.name(),
                row.email(),
                row.planId(),
                row.status(),
                row.noteCount(),
                row.storageBytes(),
                row.joinedAt(),
                row.lastActiveAt(),
                row.lastLogin(),
                List.of(row.lastLogin()),
                row.activities()
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

        userRestClient.patch()
                .uri("/internal/v1/users/{userId}/status", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("status", request.status().name()))
                .retrieve()
                .toBodilessEntity();

        return new AdminUserStatusChangeData(userId, request.status(), OffsetDateTime.now());
    }

    @Transactional
    public AdminUserWithdrawalData withdrawUser(String userId) {
        recordOperation("USER_WITHDRAWAL_REQUEST", "USER", userId, null);

        userRestClient.post()
                .uri("/internal/v1/users/{userId}/withdrawal", userId)
                .retrieve()
                .toBodilessEntity();

        return new AdminUserWithdrawalData(userId, "DEL-" + userId, "REQUESTED");
    }

    @Transactional
    public AdminUserBulkActionData runBulkAction(AdminUserBulkActionRequest request) {
        String jobId = "JOB-" + UUID.randomUUID();
        recordOperation("USER_BULK_" + request.action(), "USER_BULK", String.join(",", request.userIds()), "jobId=" + jobId);

        if (request.action() == BulkAction.CHANGE_PLAN && request.targetPlanId() != null) {
            for (String userId : request.userIds()) {
                changeUserPlan(userId, new AdminUserPlanChangeRequest(request.targetPlanId(), request.reason()));
            }
            return new AdminUserBulkActionData(request.userIds().size(), 0, jobId);
        }

        if (request.action() == BulkAction.SEND_NOTICE) {
            return new AdminUserBulkActionData(request.userIds().size(), 0, jobId);
        }

        userRestClient.post()
                .uri("/internal/v1/users/bulk-actions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("userIds", request.userIds(), "action", request.action().name()))
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
    public SupportReplyData replyTicket(String ticketId, SupportReplyCreateRequest request) {
        SupportReplyData reply = new SupportReplyData("RPL-" + UUID.randomUUID(), ticketId, "adm_001", OffsetDateTime.now());
        recordOperation("SUPPORT_TICKET_REPLY", "SUPPORT_TICKET", ticketId, "replyId=" + reply.replyId());

        userRestClient.post()
                .uri("/internal/v1/support/tickets/{ticketId}/replies", ticketId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("body", request.body()))
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
        return commerceRestClient.get()
                .uri("/internal/v1/billing/summary")
                .retrieve()
                .body(AdminBillingSummaryData.class);
    }

    public AdminPaymentsData listPayments(PaymentStatus status, PlanId planId, int page, int size) {
        List<InternalPaymentDto> payments = commerceRestClient.get()
                .uri("/internal/v1/billing/payments")
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalPaymentDto>>() {});

        if (payments == null) {
            payments = Collections.emptyList();
        }

        Map<String, InternalUserDto> usersById = userMap();

        List<AdminPaymentRow> rows = payments.stream()
                .map(payment -> mapPayment(payment, usersById.get(payment.userId())))
                .filter(payment -> status == null || payment.status() == status)
                .filter(payment -> planId == null || payment.planId() == planId)
                .toList();

        return new AdminPaymentsData(rows, new PaginationData(page, size, rows.size(), 1));
    }

    @Transactional
    public AdminPaymentActionData refundPayment(String paymentId) {
        recordOperation("PAYMENT_REFUND_REQUEST", "PAYMENT", paymentId, null);

        commerceRestClient.post()
                .uri("/internal/v1/billing/payments/{paymentId}/refund", paymentId)
                .retrieve()
                .toBodilessEntity();

        return new AdminPaymentActionData(paymentId, "REFUND_REQUESTED", OffsetDateTime.now());
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
        Map<String, InternalUserDto> usersById = userMap();

        List<AdminSubscriptionRow> rows = subscriptions.stream()
                .map(subscription -> mapSubscription(subscription, plansById.get(subscription.planId()), usersById.get(subscription.userId())))
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
        List<InternalPaymentFailureDto> failures = commerceRestClient.get()
                .uri("/internal/v1/billing/failures")
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalPaymentFailureDto>>() {});

        if (failures == null) {
            failures = Collections.emptyList();
        }

        Map<String, InternalUserDto> usersById = userMap();

        List<AdminPaymentFailureRow> rows = failures.stream()
                .map(failure -> mapPaymentFailure(failure, usersById.get(failure.userId())))
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
        List<InternalSubscriptionDto> list = commerceRestClient.get()
                .uri("/internal/v1/billing/subscriptions")
                .retrieve()
                .body(new ParameterizedTypeReference<List<InternalSubscriptionDto>>() {});
        return list != null ? list : Collections.emptyList();
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

    private AdminUserRow mapUserRow(InternalUserDto user, String rawPlanId) {
        PlanId planId = toPlanId(rawPlanId);
        ManagedUserStatus userStatus = toManagedStatus(user.status());
        OffsetDateTime joinedAt = toOffset(user.createdAt(), BASE);
        OffsetDateTime lastActiveAt = toOffset(user.updatedAt(), joinedAt);
        AdminUserLoginSession lastLogin = buildLoginSession(user.userId(), lastActiveAt);

        return new AdminUserRow(
                user.userId(),
                displayName(user, user.userId()),
                valueOr(user.email(), ""),
                planId,
                userStatus,
                0,
                0L,
                joinedAt,
                lastActiveAt,
                lastLogin,
                buildActivities(user, planId, userStatus, lastActiveAt)
        );
    }

    private AdminPaymentRow mapPayment(InternalPaymentDto payment, InternalUserDto user) {
        return new AdminPaymentRow(
                payment.paymentId(),
                payment.transactionId(),
                payment.userId(),
                displayName(user, payment.userId()),
                toPlanId(payment.planId()),
                payment.amount(),
                payment.currency(),
                payment.method(),
                toPaymentStatus(payment.status(), payment.failureReason()),
                payment.paidAt() != null ? payment.paidAt().atZone(ZoneId.systemDefault()).toOffsetDateTime() : BASE
        );
    }

    private AdminSubscriptionRow mapSubscription(InternalSubscriptionDto subscription, PlanDataDto plan, InternalUserDto user) {
        String userName = displayName(user, subscription.userId());
        String initial = userName.isBlank() ? "U" : userName.substring(0, 1);
        return new AdminSubscriptionRow(
                subscription.subscriptionId(),
                subscription.userId(),
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
        return new AdminPaymentFailureRow(
                failure.paymentId(),
                failure.userId(),
                displayName(user, failure.userId()),
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
                valueOr(ticket.body(), "")
        );
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

    private int countActiveUsers() {
        return (int) userMap().values().stream()
                .filter(user -> user.status() == UserStatusType.ACTIVE)
                .count();
    }

    private List<LogData> buildDashboardLogs() {
        return operationEvents.findTop20ByOrderByCreatedAtDesc().stream()
                .limit(8)
                .map(event -> new LogData(
                        logLevel(event.getAction()),
                        event.getTargetType(),
                        buildLogMessage(event),
                        event.getCreatedAt().toLocalTime().withNano(0).toString()
                ))
                .toList();
    }

    private List<Integer> buildRevenueTrend(BigDecimal currentRevenue) {
        List<Integer> values = monitoringSnapshotRepository.findAll().stream()
                .sorted(Comparator.comparing(AdminMonitoringSnapshot::getCapturedAt))
                .map(snapshot -> snapshot.getMonthlyRevenue().intValue())
                .skip(Math.max(0, monitoringSnapshotRepository.findAll().size() - 13L))
                .collect(Collectors.toCollection(ArrayList::new));
        values.add(currentRevenue.intValue());
        return normalizeTrend(values);
    }

    private List<Integer> buildActiveUserTrend(int activeUsers) {
        List<Integer> values = monitoringSnapshotRepository.findAll().stream()
                .sorted(Comparator.comparing(AdminMonitoringSnapshot::getCapturedAt))
                .map(AdminMonitoringSnapshot::getActiveUsers)
                .skip(Math.max(0, monitoringSnapshotRepository.findAll().size() - 13L))
                .collect(Collectors.toCollection(ArrayList::new));
        values.add(activeUsers);
        return normalizeTrend(values);
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

    private String formatMoney(BigDecimal value) {
        return "₩" + value.divide(BigDecimal.valueOf(1_000_000), 1, RoundingMode.HALF_UP) + "M";
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
        if (user.nickname() != null && !user.nickname().isBlank()) {
            return user.nickname();
        }
        if (user.email() != null && !user.email().isBlank()) {
            return user.email();
        }
        return fallbackId;
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

    private AdminUserLoginSession buildLoginSession(String userId, OffsetDateTime lastSeenAt) {
        int seed = Math.abs(userId.hashCode());
        String[] devices = {"Chrome / Windows", "Safari / iOS", "Chrome / Android", "Edge / Windows"};
        String[] locations = {"서울", "부산", "대전", "수원"};
        int idx = seed % devices.length;

        return new AdminUserLoginSession(
                userId + "-session",
                devices[idx],
                locations[idx],
                "121.168." + (20 + idx) + "." + (100 + idx),
                "ua-" + Integer.toHexString(seed),
                lastSeenAt,
                true
        );
    }

    private List<AdminUserActivity> buildActivities(InternalUserDto user, PlanId planId, ManagedUserStatus status, OffsetDateTime occurredAt) {
        List<AdminUserActivity> activities = new ArrayList<>();
        activities.add(new AdminUserActivity(user.userId() + "-profile", "USER_SYNC", "사용자 정보 동기화", occurredAt));
        activities.add(new AdminUserActivity(user.userId() + "-plan", "SUBSCRIPTION", "현재 플랜: " + planId.name(), occurredAt));
        activities.add(new AdminUserActivity(user.userId() + "-status", "ACCOUNT_STATUS", "계정 상태: " + status.name(), occurredAt));
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

    private static String planDescription(String planId) {
        if ("free".equals(planId)) return "노트 100개 · 기본 AI 요약";
        if ("pro".equals(planId)) return "무제한 노트 · 고급 AI · 대화";
        if ("max".equals(planId)) return "협업 · 권한 관리 · 우선 지원";
        return "";
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private void recordOperation(String action, String targetType, String targetId, String detail) {
        operationEvents.save(new AdminOperationEvent(action, targetType, targetId, "adm_001", detail));
    }

    public record InternalUserDto(
            String userId,
            String email,
            String nickname,
            String role,
            UserStatusType status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            LocalDateTime deletionScheduledAt,
            String deletionReason
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
}
