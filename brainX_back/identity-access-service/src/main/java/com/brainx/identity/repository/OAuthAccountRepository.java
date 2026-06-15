package com.brainx.identity.repository;

import com.brainx.identity.entity.OAuthAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OAuthAccountRepository extends JpaRepository<OAuthAccount, String> {
    Optional<OAuthAccount> findByProviderAndProviderUserId(String provider, String providerUserId);
    Optional<OAuthAccount> findByUserUserIdAndProvider(String userId, String provider);
    boolean existsByUserUserIdAndProvider(String userId, String provider);
}
