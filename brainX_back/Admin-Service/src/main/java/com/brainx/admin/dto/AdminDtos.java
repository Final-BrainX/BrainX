package com.brainx.admin.dto;

import com.brainx.admin.entity.AdminRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class AdminDtos {
    private AdminDtos() {
    }

    public enum PlanId { free, pro, max }
    public enum ManagedUserStatus { ACTIVE, SUSPENDED, WITHDRAWN }
    public enum PaymentStatus { SUCCESS, FAILED, REFUNDED, CANCELED }
    public enum SupportStatus { OPEN, IN_PROGRESS, RESOLVED, CLOSED }
    public enum BulkAction { CHANGE_PLAN, SUSPEND, REACTIVATE, WITHDRAW, SEND_NOTICE }
    public enum ApplyTiming { IMMEDIATE, NEXT_BILLING }

    public record PaginationData(int page, int size, long totalItems, int totalPages) {}
    public record KpiData(String label, String value, String delta, String tone, String sub) {}
    public record ServiceHealthData(String name, String latency, String uptime, String state) {}
    public record LogData(String level, String service, String message, String time) {}

    public record AdminDashboardOverviewData(
            List<KpiData> kpis,
            List<ServiceHealthData> services,
            List<LogData> logs,
            List<Integer> revenueTrend,
            List<Integer> activeUserTrend
    ) {}

    public record AdminUserLoginSession(
            String sessionId,
            String device,
            String location,
            String ipAddress,
            String userAgentHash,
            OffsetDateTime lastSeenAt,
            boolean current
    ) {}

    public record AdminUserActivity(
            String activityId,
            String type,
            String message,
            OffsetDateTime occurredAt
    ) {}

    public record AdminUserRow(
            String userId,
            String name,
            String email,
            PlanId planId,
            ManagedUserStatus status,
            int noteCount,
            long storageBytes,
            OffsetDateTime joinedAt,
            OffsetDateTime lastActiveAt,
            AdminUserLoginSession lastLogin,
            List<AdminUserActivity> activities
    ) {}

    public record AdminUsersData(List<AdminUserRow> users, PaginationData pagination, int resultCount) {}
    public record AdminUserDetailData(
            String userId,
            String name,
            String email,
            PlanId planId,
            ManagedUserStatus status,
            int noteCount,
            long storageBytes,
            OffsetDateTime joinedAt,
            OffsetDateTime lastActiveAt,
            AdminUserLoginSession lastLogin,
            List<AdminUserLoginSession> sessions,
            List<AdminUserActivity> activities
    ) {}

    public record AdminUserPlanChangeRequest(@NotNull PlanId targetPlanId, String reason) {}
    public record AdminUserPlanChangeData(String userId, PlanId planId, OffsetDateTime changedAt) {}
    public record AdminUserStatusChangeRequest(@NotNull ManagedUserStatus status, String reason) {}
    public record AdminUserStatusChangeData(String userId, ManagedUserStatus status, OffsetDateTime changedAt) {}
    public record AdminUserWithdrawalRequest(String reason) {}
    public record AdminUserWithdrawalData(String userId, String deletionRequestId, String status) {}

    public record NoticeRequest(@NotBlank String title, @NotBlank String body) {}
    public record AdminUserBulkActionRequest(
            @NotEmpty List<String> userIds,
            @NotNull BulkAction action,
            PlanId targetPlanId,
            NoticeRequest notice,
            String reason
    ) {}
    public record AdminUserBulkActionData(int accepted, int failed, String jobId) {}

    public record AdminMeData(
            String adminUserId,
            String name,
            String email,
            String role,
            List<String> permissions,
            boolean mustChangePassword,
            OffsetDateTime lastLoginAt,
            OffsetDateTime createdAt
    ) {}
    public record AdminProfileUpdateRequest(String name, @Email String email) {}
    public record AdminPasswordChangeRequest(@NotBlank String currentPassword, @NotBlank String newPassword) {}

    public record AdminLoginRequest(@NotBlank String loginId, @NotBlank String password) {}
    public record AdminLoginData(String accessToken, AdminMeData admin) {}

    public record AdminAccountRow(
            String adminId,
            String name,
            String loginId,
            AdminRole role,
            boolean mustChangePassword,
            OffsetDateTime createdAt,
            OffsetDateTime lastLoginAt
    ) {}
    public record AdminAccountsData(List<AdminAccountRow> admins) {}
    public record AdminAccountCreateRequest(@NotBlank String name, @NotBlank String loginId, @NotNull AdminRole role) {}
    public record AdminAccountCreateData(AdminAccountRow admin, String temporaryPassword) {}

    public record SupportTicketData(
            String ticketId,
            String userId,
            String userName,
            String email,
            SupportStatus status,
            String category,
            String subject,
            OffsetDateTime createdAt,
            String assigneeAdminUserId,
            String assigneeAdminName,
            boolean urgent,
            String body
    ) {}
    public record AdminSupportTicketsData(List<SupportTicketData> tickets) {}
    public record AdminSupportTicketData(SupportTicketData ticket) {}
    public record AdminSupportTicketUpdateRequest(SupportStatus status, String assigneeAdminUserId) {}
    public record SupportReplyCreateRequest(@NotBlank String body, Boolean faq) {}
    public record SupportReplyData(String replyId, String ticketId, String adminUserId, OffsetDateTime createdAt) {}

    public record AdminBillingSummaryData(
            BigDecimal monthlyRevenue,
            int activeSubscriptions,
            BigDecimal mrr,
            int failedPaymentCount
    ) {}
    public record AdminPaymentRow(
            String paymentId,
            String transactionId,
            String userId,
            String userName,
            PlanId planId,
            BigDecimal amount,
            String currency,
            String method,
            PaymentStatus status,
            OffsetDateTime paidAt
    ) {}
    public record AdminPaymentsData(List<AdminPaymentRow> payments, PaginationData pagination) {}
    public record AdminPaymentRefundRequest(BigDecimal amount, String reason) {}
    public record AdminPaymentActionData(String paymentId, String status, OffsetDateTime acceptedAt) {}

    public record AdminSubscriptionRow(
            String subscriptionId,
            String userId,
            String userName,
            String initial,
            PlanId planId,
            OffsetDateTime startedAt,
            OffsetDateTime nextBillingAt,
            BigDecimal amount,
            String currency
    ) {}
    public record AdminSubscriptionsData(List<AdminSubscriptionRow> subscriptions) {}

    public record AdminPaymentFailureRow(
            String paymentId,
            String userId,
            String userName,
            PlanId planId,
            BigDecimal amount,
            String currency,
            String reason,
            int retryCount,
            OffsetDateTime failedAt
    ) {}
    public record AdminPaymentFailuresData(List<AdminPaymentFailureRow> failures) {}

    public record AdminPlanData(
            PlanId planId,
            String name,
            BigDecimal price,
            String currency,
            String description,
            OffsetDateTime effectiveAt
    ) {}
    public record AdminPlansData(List<AdminPlanData> plans) {}
    public record AdminPlanPriceUpdateRequest(@NotNull @Min(0) BigDecimal price, String currency, @NotNull ApplyTiming applyTiming) {}

    public record AdminTokenUsageData(List<Map<String, Object>> usage, BigDecimal totalCost) {}
}
