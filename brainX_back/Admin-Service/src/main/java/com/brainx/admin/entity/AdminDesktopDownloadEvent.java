package com.brainx.admin.entity;

import com.brainx.admin.dto.AdminDtos.DesktopPlatform;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "admin_desktop_download_events")
public class AdminDesktopDownloadEvent {
    @Id
    @Column(name = "download_id", length = 40)
    private String downloadId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DesktopPlatform platform;

    @Column(nullable = true, length = 60)
    private String installerVersion;

    @Column(nullable = true, length = 60)
    private String source;

    @Column(nullable = true, length = 128)
    private String clientKeyHash;

    @Column(nullable = true, length = 128)
    private String userAgentHash;

    @Column(nullable = true, length = 120)
    private String ipAddress;

    @Column(nullable = false)
    private OffsetDateTime downloadedAt;

    protected AdminDesktopDownloadEvent() {
    }

    public AdminDesktopDownloadEvent(
            DesktopPlatform platform,
            String installerVersion,
            String source,
            String clientKeyHash,
            String userAgentHash,
            String ipAddress,
            OffsetDateTime downloadedAt
    ) {
        this.platform = platform;
        this.installerVersion = installerVersion;
        this.source = source;
        this.clientKeyHash = clientKeyHash;
        this.userAgentHash = userAgentHash;
        this.ipAddress = ipAddress;
        this.downloadedAt = downloadedAt;
    }

    @PrePersist
    void prePersist() {
        if (downloadId == null) {
            downloadId = "add_" + UUID.randomUUID().toString().replace("-", "");
        }
        if (downloadedAt == null) {
            downloadedAt = OffsetDateTime.now();
        }
    }

    public String getDownloadId() {
        return downloadId;
    }

    public DesktopPlatform getPlatform() {
        return platform;
    }

    public String getInstallerVersion() {
        return installerVersion;
    }

    public String getSource() {
        return source;
    }

    public String getClientKeyHash() {
        return clientKeyHash;
    }

    public String getUserAgentHash() {
        return userAgentHash;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public OffsetDateTime getDownloadedAt() {
        return downloadedAt;
    }
}
