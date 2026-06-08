package com.brainx.identity.repository;

import com.brainx.identity.entity.ConsentRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ConsentRecordRepository extends JpaRepository<ConsentRecord, String> {
    Optional<ConsentRecord> findTopByUserUserIdOrderByCreatedAtDesc(String userId);
}
