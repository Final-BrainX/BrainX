package com.brainx.admin.config;

import com.brainx.admin.entity.AdminAccount;
import com.brainx.admin.entity.AdminRole;
import com.brainx.admin.repository.AdminAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/**
 * 최상위 관리자(owner) 계정 초기 시드. admin_accounts 테이블이 비어 있을 때만 생성한다.
 * 운영 전환 시 SEED_ADMIN_PASSWORD를 반드시 교체할 것.
 */
@Component
public class AdminAccountSeeder {

    private final AdminAccountRepository adminAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${brainx.admin.seed.login-id:admin}")
    private String seedLoginId;

    @Value("${brainx.admin.seed.password:admin1234}")
    private String seedPassword;

    @Value("${brainx.admin.seed.name:최고관리자}")
    private String seedName;

    public AdminAccountSeeder(AdminAccountRepository adminAccountRepository, PasswordEncoder passwordEncoder) {
        this.adminAccountRepository = adminAccountRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostConstruct
    public void seed() {
        if (adminAccountRepository.count() > 0) {
            return;
        }

        AdminAccount owner = new AdminAccount(
                seedLoginId,
                seedName,
                null,
                passwordEncoder.encode(seedPassword),
                AdminRole.owner,
                false
        );
        adminAccountRepository.save(owner);
    }
}
