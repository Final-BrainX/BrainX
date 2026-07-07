package com.brainx.admin.config;

import com.brainx.admin.entity.AdminAccount;
import com.brainx.admin.entity.AdminRole;
import com.brainx.admin.repository.AdminAccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAccountSeederTest {

    @Mock
    private AdminAccountRepository adminAccountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private AdminAccountSeeder seeder;

    @BeforeEach
    void setUp() {
        seeder = new AdminAccountSeeder(adminAccountRepository, passwordEncoder);
        ReflectionTestUtils.setField(seeder, "seedLoginId", "admin");
        ReflectionTestUtils.setField(seeder, "seedPassword", "AdminBrainX!2026");
        ReflectionTestUtils.setField(seeder, "seedName", "BrainX Admin");
    }

    @Test
    void createsSeedAccountWhenMissing() {
        when(adminAccountRepository.findByLoginId("admin")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("AdminBrainX!2026")).thenReturn("encoded-password");

        seeder.seed();

        ArgumentCaptor<AdminAccount> accountCaptor = ArgumentCaptor.forClass(AdminAccount.class);
        verify(adminAccountRepository).save(accountCaptor.capture());

        AdminAccount saved = accountCaptor.getValue();
        assertThat(saved.getLoginId()).isEqualTo("admin");
        assertThat(saved.getName()).isEqualTo("BrainX Admin");
        assertThat(saved.getPasswordHash()).isEqualTo("encoded-password");
        assertThat(saved.getRole()).isEqualTo(AdminRole.owner);
        assertThat(saved.isMustChangePassword()).isFalse();
    }

    @Test
    void syncsExistingSeedAccountToConfiguredPasswordAndOwnerRole() {
        AdminAccount existing = new AdminAccount(
                "admin",
                "Legacy Admin",
                "legacy@example.com",
                "legacy-hash",
                AdminRole.support,
                true
        );

        when(adminAccountRepository.findByLoginId("admin")).thenReturn(Optional.of(existing));
        when(passwordEncoder.matches("AdminBrainX!2026", "legacy-hash")).thenReturn(false);
        when(passwordEncoder.encode("AdminBrainX!2026")).thenReturn("encoded-password");
        when(adminAccountRepository.save(any(AdminAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));

        seeder.seed();

        verify(adminAccountRepository).save(existing);
        assertThat(existing.getName()).isEqualTo("BrainX Admin");
        assertThat(existing.getPasswordHash()).isEqualTo("encoded-password");
        assertThat(existing.getRole()).isEqualTo(AdminRole.owner);
        assertThat(existing.isMustChangePassword()).isFalse();
        assertThat(existing.getEmail()).isEqualTo("legacy@example.com");
    }
}
