package com.brainx.identity.repository;

import com.brainx.identity.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.consentRecords WHERE u.userId = :userId")
    Optional<User> findByIdWithConsents(String userId);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.oauthAccounts WHERE u.userId = :userId")
    Optional<User> findByIdWithOAuthAccounts(String userId);
}
