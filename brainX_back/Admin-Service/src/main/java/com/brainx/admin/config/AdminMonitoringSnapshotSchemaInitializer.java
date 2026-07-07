package com.brainx.admin.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AdminMonitoringSnapshotSchemaInitializer {
    private static final Logger log = LoggerFactory.getLogger(AdminMonitoringSnapshotSchemaInitializer.class);

    private final JdbcTemplate jdbcTemplate;

    public AdminMonitoringSnapshotSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    void ensureDownloadColumns() {
        ensureColumnWithDefault("desktop_download_count");
        ensureColumnWithDefault("desktop_download_users");
    }

    private void ensureColumnWithDefault(String columnName) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE admin_monitoring_snapshots " +
                            "ADD COLUMN IF NOT EXISTS " + columnName + " integer NOT NULL DEFAULT 0"
            );
            log.info("Ensured admin_monitoring_snapshots.{} exists with default 0", columnName);
        } catch (RuntimeException exception) {
            log.warn("Failed to ensure admin_monitoring_snapshots.{} exists: {}", columnName, exception.getMessage());
        }
    }
}
