package com.brainx.ingestion.repository;

import com.brainx.ingestion.entity.ImportJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ImportJobRepository extends JpaRepository<ImportJob, String> {

    Optional<ImportJob> findByImportJobIdAndUserId(String importJobId, String userId);
}
