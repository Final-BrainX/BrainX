package com.brainx.ingestion.repository;

import com.brainx.ingestion.entity.IntegrationAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface IntegrationAccountRepository extends JpaRepository<IntegrationAccount, String> {

    Optional<IntegrationAccount> findByIntegrationAccountIdAndUserId(String integrationAccountId, String userId);

    Optional<IntegrationAccount> findByStateAndUserId(String state, String userId);
}
