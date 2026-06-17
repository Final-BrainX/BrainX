package com.brainx.ingestion.repository;

import com.brainx.ingestion.entity.ExportJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExportJobRepository extends JpaRepository<ExportJob, String> {

    Optional<ExportJob> findByExportJobIdAndUserId(String exportJobId, String userId);
}
