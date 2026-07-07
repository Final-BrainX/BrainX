package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.AdminBillingSummaryData;
import com.brainx.admin.dto.AdminDtos.AdminUsersData;
import com.brainx.admin.repository.AdminDesktopDownloadEventRepository;
import com.brainx.admin.repository.AdminMonitoringSnapshotRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.repository.AdminServiceHealthSnapshotRepository;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminServiceBillingFallbackTest {

    @Mock
    private RestClient userRestClient;

    @Mock
    private RestClient commerceRestClient;

    @Mock
    private RestClient workspaceRestClient;

    @Mock
    private RestClient defaultRestClient;

    @Mock
    private RestClient.RequestHeadersUriSpec userGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> userRequest;

    @Mock
    private RestClient.ResponseSpec userResponse;

    @Mock
    private RestClient.RequestHeadersUriSpec commerceGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> commerceRequest;

    @Mock
    private RestClient.ResponseSpec commerceResponse;

    @Mock
    private RestClient.RequestHeadersUriSpec workspaceGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> workspaceRequest;

    @Mock
    private RestClient.ResponseSpec workspaceResponse;

    @Mock
    private AdminRefundNotificationService refundNotificationService;

    @Mock
    private AdminKafkaLagCollector kafkaLagCollector;

    @Mock
    private AdminDesktopDownloadEventRepository desktopDownloadEventRepository;

    @Mock
    private AdminOperationEventRepository operationEvents;

    @Mock
    private AdminServiceHealthSnapshotRepository healthSnapshotRepository;

    @Mock
    private AdminMonitoringSnapshotRepository monitoringSnapshotRepository;

    private AdminService adminService;

    @BeforeEach
    void setUp() {
        adminService = new AdminService(
                userRestClient,
                commerceRestClient,
                workspaceRestClient,
                defaultRestClient,
                refundNotificationService,
                kafkaLagCollector,
                desktopDownloadEventRepository,
                operationEvents,
                healthSnapshotRepository,
                monitoringSnapshotRepository
        );
    }

    @Test
    void billingSummaryFallsBackToZeroWhenCommerceServiceFails() {
        when(commerceRestClient.get()).thenReturn(commerceGet);
        when(commerceGet.uri("/internal/v1/billing/summary")).thenReturn((RestClient.RequestHeadersSpec) commerceRequest);
        when(commerceRequest.retrieve()).thenReturn(commerceResponse);
        when(commerceResponse.body(AdminBillingSummaryData.class)).thenThrow(new RuntimeException("commerce unavailable"));

        AdminBillingSummaryData summary = adminService.billingSummary();

        Assertions.assertThat(summary.monthlyRevenue()).isZero();
        Assertions.assertThat(summary.activeSubscriptions()).isZero();
        Assertions.assertThat(summary.mrr()).isZero();
        Assertions.assertThat(summary.failedPaymentCount()).isZero();
    }

    @Test
    @SuppressWarnings("unchecked")
    void listUsersStillReturnsRowsWhenCommercePlanLookupFails() {
        List<AdminService.InternalUserDto> users = List.of(
                new AdminService.InternalUserDto(
                        "usr_1",
                        "user1@example.com",
                        "User One",
                        "USER",
                        AdminService.UserStatusType.ACTIVE,
                        LocalDateTime.of(2026, 7, 1, 9, 0),
                        LocalDateTime.of(2026, 7, 1, 9, 0),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )
        );

        when(userRestClient.get()).thenReturn(userGet);
        when(userGet.uri(any(java.util.function.Function.class))).thenReturn((RestClient.RequestHeadersSpec) userRequest);
        when(userRequest.retrieve()).thenReturn(userResponse);
        when(userResponse.body(any(ParameterizedTypeReference.class))).thenReturn(users);

        when(commerceRestClient.get()).thenReturn(commerceGet);
        when(commerceGet.uri(eq("/internal/v1/billing/subscriptions"))).thenReturn((RestClient.RequestHeadersSpec) commerceRequest);
        when(commerceRequest.retrieve()).thenReturn(commerceResponse);
        when(commerceResponse.body(any(ParameterizedTypeReference.class))).thenThrow(new RuntimeException("missing billing_cycle"));

        when(workspaceRestClient.get()).thenReturn(workspaceGet);
        when(workspaceGet.uri(eq("/internal/v1/workspace/users/{userId}/stats"), eq("usr_1"))).thenReturn((RestClient.RequestHeadersSpec) workspaceRequest);
        when(workspaceRequest.retrieve()).thenReturn(workspaceResponse);
        when(workspaceResponse.body(any(ParameterizedTypeReference.class))).thenReturn(
                new AdminService.InternalApiEnvelope<>(true, new AdminService.InternalUserWorkspaceStatsDto(0, 0L, List.of()), "ok")
        );

        AdminUsersData data = adminService.listUsers(null, null, null, null, 0, 20);

        Assertions.assertThat(data.resultCount()).isEqualTo(1);
        Assertions.assertThat(data.users()).hasSize(1);
        Assertions.assertThat(data.users().getFirst().planId().name()).isEqualTo("free");
    }
}
