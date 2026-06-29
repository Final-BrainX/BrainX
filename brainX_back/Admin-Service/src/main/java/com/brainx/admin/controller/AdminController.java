package com.brainx.admin.controller;

import com.brainx.admin.dto.ApiResponse;
import com.brainx.admin.dto.AdminDtos.*;
import com.brainx.admin.service.AdminAuthService;
import com.brainx.admin.service.AdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
    private final AdminService adminService;
    private final AdminAuthService adminAuthService;

    public AdminController(AdminService adminService, AdminAuthService adminAuthService) {
        this.adminService = adminService;
        this.adminAuthService = adminAuthService;
    }

    @PostMapping("/auth/login")
    public ApiResponse<AdminLoginData> login(@Valid @RequestBody AdminLoginRequest request) {
        return ApiResponse.success(adminAuthService.login(request));
    }

    @GetMapping("/admin-accounts")
    public ApiResponse<AdminAccountsData> listAdminAccounts() {
        return ApiResponse.success(adminAuthService.listAccounts());
    }

    @PostMapping("/admin-accounts")
    public ResponseEntity<ApiResponse<AdminAccountCreateData>> createAdminAccount(Authentication auth, @Valid @RequestBody AdminAccountCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(adminAuthService.createAccount(auth.getName(), request)));
    }

    @PatchMapping("/admin-accounts/{adminId}")
    public ApiResponse<AdminAccountUpdateData> updateAdminAccount(Authentication auth, @PathVariable String adminId, @RequestBody AdminAccountUpdateRequest request) {
        return ApiResponse.success(adminAuthService.updateAccount(auth.getName(), adminId, request));
    }

    @DeleteMapping("/admin-accounts/{adminId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAdminAccount(Authentication auth, @PathVariable String adminId) {
        adminAuthService.deleteAccount(auth.getName(), adminId);
    }

    @GetMapping("/dashboard/overview")
    public ApiResponse<AdminDashboardOverviewData> dashboardOverview() {
        return ApiResponse.success(adminService.dashboardOverview());
    }

    @GetMapping("/monitoring/snapshots")
    public ApiResponse<List<com.brainx.admin.entity.AdminMonitoringSnapshot>> getMonitoringSnapshots() {
        return ApiResponse.success(adminService.getMonitoringSnapshots());
    }

    @DeleteMapping("/monitoring/snapshots/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMonitoringSnapshot(@PathVariable String id) {
        adminService.deleteMonitoringSnapshot(id);
    }

    @GetMapping("/monitoring/health")
    public ApiResponse<List<com.brainx.admin.entity.AdminServiceHealthSnapshot>> getHealthSnapshots() {
        return ApiResponse.success(adminService.getHealthSnapshots());
    }

    @DeleteMapping("/monitoring/health/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteHealthSnapshot(@PathVariable String id) {
        adminService.deleteHealthSnapshot(id);
    }

    @GetMapping("/users")
    public ApiResponse<AdminUsersData> listUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) PlanId planId,
            @RequestParam(required = false) ManagedUserStatus status,
            @RequestParam(required = false) Integer joinedYear,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(adminService.listUsers(q, planId, status, joinedYear, page, size));
    }

    @GetMapping("/users/{userId}")
    public ApiResponse<AdminUserDetailData> getUserDetail(@PathVariable String userId) {
        return ApiResponse.success(adminService.getUserDetail(userId));
    }

    @PatchMapping("/users/{userId}/plan")
    public ApiResponse<AdminUserPlanChangeData> changeUserPlan(@PathVariable String userId, @Valid @RequestBody AdminUserPlanChangeRequest request) {
        return ApiResponse.success(adminService.changeUserPlan(userId, request));
    }

    @PatchMapping("/users/{userId}/status")
    public ApiResponse<AdminUserStatusChangeData> changeUserStatus(@PathVariable String userId, @Valid @RequestBody AdminUserStatusChangeRequest request) {
        return ApiResponse.success(adminService.changeUserStatus(userId, request));
    }

    @PostMapping("/users/{userId}/withdrawal")
    public ResponseEntity<ApiResponse<AdminUserWithdrawalData>> withdrawUser(@PathVariable String userId, @RequestBody(required = false) AdminUserWithdrawalRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(adminService.withdrawUser(userId, request)));
    }

    @PostMapping("/users/bulk-actions")
    public ResponseEntity<ApiResponse<AdminUserBulkActionData>> runBulkAction(
            Authentication auth,
            @Valid @RequestBody AdminUserBulkActionRequest request
    ) {
        AdminMeData admin = adminAuthService.getMe(auth.getName());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(adminService.runBulkAction(request, admin.adminUserId(), admin.name())));
    }

    @GetMapping("/me")
    public ApiResponse<AdminMeData> getMe(Authentication auth) {
        return ApiResponse.success(adminAuthService.getMe(auth.getName()));
    }

    @PatchMapping("/me/profile")
    public ApiResponse<AdminMeData> updateProfile(Authentication auth, @Valid @RequestBody AdminProfileUpdateRequest request) {
        return ApiResponse.success(adminAuthService.updateProfile(auth.getName(), request));
    }

    @PatchMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(Authentication auth, @Valid @RequestBody AdminPasswordChangeRequest request) {
        adminAuthService.changePassword(auth.getName(), request);
    }

    @GetMapping("/token-usage")
    public ApiResponse<AdminTokenUsageData> tokenUsage(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String modelId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to
    ) {
        return ApiResponse.success(adminService.tokenUsage());
    }

    @GetMapping("/support/tickets")
    public ApiResponse<AdminSupportTicketsData> listTickets(@RequestParam(required = false) SupportStatus status) {
        return ApiResponse.success(adminService.listTickets(status));
    }

    @GetMapping("/support/tickets/{ticketId}")
    public ApiResponse<AdminSupportTicketData> getTicket(@PathVariable String ticketId) {
        return ApiResponse.success(adminService.getTicket(ticketId));
    }

    @PatchMapping("/support/tickets/{ticketId}")
    public ApiResponse<AdminSupportTicketData> updateTicket(@PathVariable String ticketId, @Valid @RequestBody AdminSupportTicketUpdateRequest request) {
        return ApiResponse.success(adminService.updateTicket(ticketId, request));
    }

    @PostMapping("/support/tickets/{ticketId}/replies")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SupportReplyData> replyTicket(Authentication auth, @PathVariable String ticketId, @Valid @RequestBody SupportReplyCreateRequest request) {
        AdminMeData admin = adminAuthService.getMe(auth.getName());
        return ApiResponse.success(adminService.replyTicket(ticketId, request, admin.adminUserId(), admin.name()));
    }

    @DeleteMapping("/support/tickets/{ticketId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTicket(@PathVariable String ticketId) {
        adminService.deleteTicket(ticketId);
    }

    @GetMapping("/billing/summary")
    public ApiResponse<AdminBillingSummaryData> billingSummary() {
        return ApiResponse.success(adminService.billingSummary());
    }

    @GetMapping("/billing/payments")
    public ApiResponse<AdminPaymentsData> listPayments(
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) PlanId planId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(adminService.listPayments(status, planId, page, size));
    }

    @PostMapping("/billing/payments/{paymentId}/refund")
    public ResponseEntity<ApiResponse<AdminPaymentActionData>> refundPayment(@PathVariable String paymentId, @RequestBody(required = false) AdminPaymentRefundRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(adminService.refundPayment(paymentId, request)));
    }

    @PostMapping("/billing/payments/{paymentId}/retry")
    public ResponseEntity<ApiResponse<AdminPaymentActionData>> retryPayment(@PathVariable String paymentId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(adminService.retryPayment(paymentId)));
    }

    @DeleteMapping("/billing/payments/{paymentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePayment(@PathVariable String paymentId) {
        adminService.deletePayment(paymentId);
    }

    @GetMapping("/billing/subscriptions")
    public ApiResponse<AdminSubscriptionsData> listSubscriptions() {
        return ApiResponse.success(adminService.listSubscriptions());
    }

    @DeleteMapping("/billing/subscriptions/{subscriptionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSubscription(@PathVariable String subscriptionId) {
        adminService.deleteSubscription(subscriptionId);
    }

    @GetMapping("/billing/payment-failures")
    public ApiResponse<AdminPaymentFailuresData> listPaymentFailures() {
        return ApiResponse.success(adminService.listPaymentFailures());
    }

    @GetMapping("/billing/plans")
    public ApiResponse<AdminPlansData> listPlans() {
        return ApiResponse.success(adminService.listPlans());
    }

    @PatchMapping("/billing/plans/{planId}")
    public ApiResponse<AdminPlanData> updatePlanPrice(@PathVariable PlanId planId, @Valid @RequestBody AdminPlanPriceUpdateRequest request) {
        return ApiResponse.success(adminService.updatePlanPrice(planId, request));
    }
}
