package com.brainx.admin.repository;

import com.brainx.admin.entity.AdminAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AdminAccountRepository extends JpaRepository<AdminAccount, String> {
    Optional<AdminAccount> findByLoginId(String loginId);

    boolean existsByLoginId(String loginId);

    long countByRole(com.brainx.admin.entity.AdminRole role);

    List<AdminAccount> findAllByOrderByCreatedAtAsc();
}
