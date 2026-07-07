package com.brainx.admin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "admin_monitoring_snapshots")
public class AdminMonitoringSnapshot {
    @Id
    @Column(name = "snapshot_id", length = 40)
    private String snapshotId;

    @Column(nullable = false)
    private BigDecimal monthlyRevenue;

    @Column(nullable = false)
    private int activeSubscriptions;

    @Column(nullable = false)
    private BigDecimal mrr;

    @Column(nullable = false)
    private int failedPaymentCount;

    @Column(nullable = false)
    private int activeUsers;

    @Column(nullable = false)
    private int desktopDownloadUsers;

    @Column(nullable = false)
    private int desktopDownloadCount;

    @Column(nullable = true)
    private Integer kafkaLagMessages;

    @Column(nullable = true, length = 120)
    private String kafkaConsumerGroupId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = true, length = 40)
    private com.brainx.admin.dto.AdminDtos.KafkaLagState kafkaLagState;

    @Column(nullable = true, length = 255)
    private String kafkaLagDetail;

    @Column(nullable = false)
    private OffsetDateTime capturedAt;

    protected AdminMonitoringSnapshot() {
    }

    public AdminMonitoringSnapshot(
            BigDecimal monthlyRevenue,
            int activeSubscriptions,
            BigDecimal mrr,
            int failedPaymentCount,
            int activeUsers,
            int desktopDownloadUsers,
            int desktopDownloadCount,
            Integer kafkaLagMessages,
            String kafkaConsumerGroupId,
            com.brainx.admin.dto.AdminDtos.KafkaLagState kafkaLagState,
            String kafkaLagDetail,
            OffsetDateTime capturedAt
    ) {
        this.monthlyRevenue = monthlyRevenue;
        this.activeSubscriptions = activeSubscriptions;
        this.mrr = mrr;
        this.failedPaymentCount = failedPaymentCount;
        this.activeUsers = activeUsers;
        this.desktopDownloadUsers = desktopDownloadUsers;
        this.desktopDownloadCount = desktopDownloadCount;
        this.kafkaLagMessages = kafkaLagMessages;
        this.kafkaConsumerGroupId = kafkaConsumerGroupId;
        this.kafkaLagState = kafkaLagState;
        this.kafkaLagDetail = kafkaLagDetail;
        this.capturedAt = capturedAt;
    }

    @PrePersist
    void prePersist() {
        if (snapshotId == null) {
            snapshotId = "ams_" + UUID.randomUUID().toString().replace("-", "");
        }
        if (capturedAt == null) {
            capturedAt = OffsetDateTime.now();
        }
    }

    public String getSnapshotId() {
        return snapshotId;
    }

    public BigDecimal getMonthlyRevenue() {
        return monthlyRevenue;
    }

    public int getActiveSubscriptions() {
        return activeSubscriptions;
    }

    public BigDecimal getMrr() {
        return mrr;
    }

    public int getFailedPaymentCount() {
        return failedPaymentCount;
    }

    public int getActiveUsers() {
        return activeUsers;
    }

    public int getDesktopDownloadUsers() {
        return desktopDownloadUsers;
    }

    public int getDesktopDownloadCount() {
        return desktopDownloadCount;
    }

    public Integer getKafkaLagMessages() {
        return kafkaLagMessages;
    }

    public String getKafkaConsumerGroupId() {
        return kafkaConsumerGroupId;
    }

    public com.brainx.admin.dto.AdminDtos.KafkaLagState getKafkaLagState() {
        return kafkaLagState;
    }

    public String getKafkaLagDetail() {
        return kafkaLagDetail;
    }

    public OffsetDateTime getCapturedAt() {
        return capturedAt;
    }
}
