package com.brainx.admin.repository;

import com.brainx.admin.entity.AdminMonitoringSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface AdminMonitoringSnapshotRepository extends JpaRepository<AdminMonitoringSnapshot, String> {
    Optional<AdminMonitoringSnapshot> findTopByOrderByCapturedAtDesc();
    List<AdminMonitoringSnapshot> findTop2ByOrderByCapturedAtDesc();
    Optional<AdminMonitoringSnapshot> findTopByCapturedAtGreaterThanEqualAndCapturedAtLessThanOrderByCapturedAtDesc(OffsetDateTime capturedAtGte, OffsetDateTime capturedAtLt);
    boolean existsByCapturedAtGreaterThanEqualAndCapturedAtLessThan(OffsetDateTime capturedAtGte, OffsetDateTime capturedAtLt);

    List<AdminMonitoringSnapshot> findAllByOrderByCapturedAtDesc();
}
