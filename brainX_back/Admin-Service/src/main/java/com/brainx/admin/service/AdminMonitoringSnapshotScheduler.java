package com.brainx.admin.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneId;

@Component
public class AdminMonitoringSnapshotScheduler {
    private static final Logger log = LoggerFactory.getLogger(AdminMonitoringSnapshotScheduler.class);

    private final AdminService adminService;

    @Value("${brainx.admin.monitoring.timezone:Asia/Seoul}")
    private String monitoringTimezone;

    public AdminMonitoringSnapshotScheduler(AdminService adminService) {
        this.adminService = adminService;
    }

    @Scheduled(cron = "${brainx.admin.monitoring.daily-snapshot-cron:0 59 23 * * *}", zone = "${brainx.admin.monitoring.timezone:Asia/Seoul}")
    public void captureDailyMonitoringSnapshot() {
        OffsetDateTime capturedAt = OffsetDateTime.now(ZoneId.of(monitoringTimezone));
        var snapshot = adminService.captureDailyMonitoringSnapshot(capturedAt);
        log.info("Daily monitoring snapshot job finished snapshotId={} capturedAt={}", snapshot.snapshotId(), snapshot.capturedAt());
    }
}
