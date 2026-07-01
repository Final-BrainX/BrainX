package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.AdminBillingSummaryData;
import com.brainx.admin.dto.AdminDtos.AdminMonitoringSnapshotData;
import com.brainx.admin.dto.AdminDtos.KafkaLagState;
import com.brainx.admin.entity.AdminMonitoringSnapshot;
import com.brainx.admin.entity.AdminServiceHealthSnapshot;
import com.brainx.admin.repository.AdminMonitoringSnapshotRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.repository.AdminServiceHealthSnapshotRepository;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminServiceMonitoringSnapshotTest {
    @Mock
    private RestClient userRestClient;

    @Mock
    private RestClient commerceRestClient;

    @Mock
    private RestClient workspaceRestClient;

    @Mock
    private RestClient defaultRestClient;

    @Mock
    private RestClient.RequestHeadersUriSpec<?> commerceGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> commerceRequest;

    @Mock
    private RestClient.ResponseSpec commerceResponse;

    @Mock
    private RestClient.RequestHeadersUriSpec<?> userGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> userRequest;

    @Mock
    private RestClient.ResponseSpec userResponse;

    @Mock
    private RestClient.RequestHeadersUriSpec<?> workspaceGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> workspaceRequest;

    @Mock
    private RestClient.ResponseSpec workspaceResponse;

    @Mock
    private RestClient.RequestHeadersUriSpec<?> defaultHealthGet;

    @Mock
    private RestClient.RequestHeadersSpec<?> defaultHealthRequest;

    @Mock
    private RestClient.ResponseSpec defaultHealthResponse;

    @Mock
    private AdminRefundNotificationService refundNotificationService;

    @Mock
    private AdminKafkaLagCollector kafkaLagCollector;

    @Mock
    private AdminOperationEventRepository operationEvents;

    @Mock
    private AdminServiceHealthSnapshotRepository healthSnapshotRepository;

    @Mock
    private AdminMonitoringSnapshotRepository monitoringSnapshotRepository;

    private AdminService adminService;

    @BeforeEach
    void setUp() {
        adminService = spy(new AdminService(
                userRestClient,
                commerceRestClient,
                workspaceRestClient,
                defaultRestClient,
                refundNotificationService,
                kafkaLagCollector,
                operationEvents,
                healthSnapshotRepository,
                monitoringSnapshotRepository
        ));
        ReflectionTestUtils.setField(adminService, "kafkaMonitoringConsumerGroupId", "intelligence-service");
        ReflectionTestUtils.setField(adminService, "monitoringTimezone", "Asia/Seoul");
    }

    @Test
    void captureDailyMonitoringSnapshotPersistsOncePerDay() {
        OffsetDateTime capturedAt = OffsetDateTime.parse("2026-07-01T23:59:00+09:00");
        stubCaptureInputs(capturedAt);
        AdminMonitoringSnapshot savedSnapshot = createMonitoringSnapshot(
                "ams_saved",
                new BigDecimal("1234567"),
                12,
                new BigDecimal("890123"),
                3,
                42,
                17,
                "intelligence-service",
                KafkaLagState.HEALTHY,
                "Current lag 17 msgs",
                capturedAt
        );

        when(monitoringSnapshotRepository.findTopByCapturedAtGreaterThanEqualAndCapturedAtLessThanOrderByCapturedAtDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(monitoringSnapshotRepository.save(any(AdminMonitoringSnapshot.class))).thenAnswer(invocation -> {
            AdminMonitoringSnapshot snapshot = invocation.getArgument(0);
            ReflectionTestUtils.setField(snapshot, "snapshotId", "ams_saved");
            return snapshot;
        });
        when(kafkaLagCollector.collect(anyString())).thenReturn(new AdminKafkaLagObservation(17, "intelligence-service", KafkaLagState.HEALTHY, "Current lag 17 msgs"));

        ArgumentCaptor<AdminMonitoringSnapshot> monitoringCaptor = ArgumentCaptor.forClass(AdminMonitoringSnapshot.class);

        AdminMonitoringSnapshotData data = adminService.captureDailyMonitoringSnapshot(capturedAt);

        Assertions.assertThat(data.monthlyRevenue()).isEqualTo(new BigDecimal("1234567"));
        Assertions.assertThat(data.activeSubscriptions()).isEqualTo(12);
        Assertions.assertThat(data.activeUsers()).isEqualTo(42);
        Assertions.assertThat(data.kafkaLagMessages()).isEqualTo(17);

        verify(monitoringSnapshotRepository).save(monitoringCaptor.capture());
        Assertions.assertThat(monitoringCaptor.getValue().getCapturedAt()).isEqualTo(capturedAt);
        verify(adminService, times(1)).collectServiceHealths(true, capturedAt);

        reset(monitoringSnapshotRepository);
        when(monitoringSnapshotRepository.findTopByCapturedAtGreaterThanEqualAndCapturedAtLessThanOrderByCapturedAtDesc(any(), any()))
                .thenReturn(Optional.of(savedSnapshot));
        AdminMonitoringSnapshotData duplicate = adminService.captureDailyMonitoringSnapshot(capturedAt);
        Assertions.assertThat(duplicate.snapshotId()).isEqualTo("ams_saved");
    }

    @Test
    void captureDailyMonitoringSnapshotSkipsExistingDailySnapshot() {
        OffsetDateTime capturedAt = OffsetDateTime.parse("2026-07-01T23:59:00+09:00");
        AdminMonitoringSnapshot existing = createMonitoringSnapshot(
                "ams_existing",
                new BigDecimal("1"),
                1,
                new BigDecimal("1"),
                1,
                1,
                0,
                "intelligence-service",
                KafkaLagState.HEALTHY,
                "Current lag 0 msgs",
                capturedAt
        );

        when(monitoringSnapshotRepository.findTopByCapturedAtGreaterThanEqualAndCapturedAtLessThanOrderByCapturedAtDesc(any(), any()))
                .thenReturn(Optional.of(existing));

        AdminMonitoringSnapshotData data = adminService.captureDailyMonitoringSnapshot(capturedAt);

        Assertions.assertThat(data.snapshotId()).isEqualTo("ams_existing");
        verify(monitoringSnapshotRepository, never()).save(any(AdminMonitoringSnapshot.class));
        verify(kafkaLagCollector, never()).collect(anyString());
    }

    private void stubCaptureInputs(OffsetDateTime capturedAt) {
        AdminBillingSummaryData summary = new AdminBillingSummaryData(
                new BigDecimal("1234567"),
                12,
                new BigDecimal("890123"),
                3
        );

        AdminService.InternalTrendSeriesDto userTrend = new AdminService.InternalTrendSeriesDto(
                "activeUsers",
                List.of(40, 41, 42),
                "최근 3일",
                3,
                "Asia/Seoul",
                "User-Service"
        );
        AdminService.InternalUserGrowthSummaryDto userGrowthSummary = new AdminService.InternalUserGrowthSummaryDto(42, userTrend);
        doReturn(summary).when(adminService).billingSummary();
        doReturn(userGrowthSummary).when(adminService).fetchUserGrowthSummary(14);
        doReturn(List.of()).when(adminService).collectServiceHealths(true, capturedAt);
        when(monitoringSnapshotRepository.findTop2ByOrderByCapturedAtDesc()).thenReturn(List.of());
        when(monitoringSnapshotRepository.findAll()).thenReturn(List.of());
    }

    private AdminMonitoringSnapshot createMonitoringSnapshot(
            String snapshotId,
            BigDecimal monthlyRevenue,
            int activeSubscriptions,
            BigDecimal mrr,
            int failedPaymentCount,
            int activeUsers,
            Integer kafkaLagMessages,
            String kafkaConsumerGroupId,
            KafkaLagState kafkaLagState,
            String kafkaLagDetail,
            OffsetDateTime capturedAt
    ) {
        AdminMonitoringSnapshot snapshot = new AdminMonitoringSnapshot(
                monthlyRevenue,
                activeSubscriptions,
                mrr,
                failedPaymentCount,
                activeUsers,
                kafkaLagMessages,
                kafkaConsumerGroupId,
                kafkaLagState,
                kafkaLagDetail,
                capturedAt
        );
        ReflectionTestUtils.setField(snapshot, "snapshotId", snapshotId);
        return snapshot;
    }
}
