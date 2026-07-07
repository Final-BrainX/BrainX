package com.brainx.admin.config;

import com.brainx.admin.entity.AdminAccount;
import com.brainx.admin.entity.AdminRole;
import com.brainx.admin.repository.AdminAccountRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ensures the runtime seed owner account always exists and stays aligned
 * with the configured SEED_ADMIN_* values.
 */
@Component
public class AdminAccountSeeder {

    private final AdminAccountRepository adminAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${brainx.admin.seed.login-id:admin}")
    private String seedLoginId;

    @Value("${brainx.admin.seed.password:admin1234}")
    private String seedPassword;

    @Value("${brainx.admin.seed.name:BrainX Admin}")
    private String seedName;

    public AdminAccountSeeder(AdminAccountRepository adminAccountRepository, PasswordEncoder passwordEncoder) {
        this.adminAccountRepository = adminAccountRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostConstruct
    @Transactional
    public void seed() {
        AdminAccount seedAdmin = adminAccountRepository.findByLoginId(seedLoginId)
                .map(this::syncExistingSeedAccount)
                .orElseGet(this::createSeedAccount);

        adminAccountRepository.save(seedAdmin);
    }

    private AdminAccount syncExistingSeedAccount(AdminAccount admin) {
        admin.setName(seedName);
        admin.setRole(AdminRole.owner);
        admin.setMustChangePassword(false);

        if (!passwordEncoder.matches(seedPassword, admin.getPasswordHash())) {
            admin.setPasswordHash(passwordEncoder.encode(seedPassword));
        }

        return admin;
    }

    private AdminAccount createSeedAccount() {
        if (seedPassword == null || seedPassword.isBlank()) {
            throw new IllegalStateException("SEED_ADMIN_PASSWORD must not be blank when creating the seed admin account.");
        }

        return new AdminAccount(
                seedLoginId,
                seedName,
                null,
                passwordEncoder.encode(seedPassword),
                AdminRole.owner,
                false
        );
    }
}
