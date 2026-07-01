package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.AdminAccountCreateData;
import com.brainx.admin.dto.AdminDtos.AdminAccountCreateRequest;
import com.brainx.admin.entity.AdminAccount;
import com.brainx.admin.entity.AdminOperationEvent;
import com.brainx.admin.entity.AdminRole;
import com.brainx.admin.repository.AdminAccountRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.security.AdminJwtTokenProvider;
import com.brainx.admin.security.StrongPasswordGenerator;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAuthServiceAccountEmailTest {

    @Mock
    private AdminAccountRepository adminAccountRepository;

    @Mock
    private AdminOperationEventRepository operationEvents;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AdminJwtTokenProvider jwtTokenProvider;

    @Mock
    private StrongPasswordGenerator passwordGenerator;

    private AdminAuthService adminAuthService;

    @BeforeEach
    void setUp() {
        adminAuthService = new AdminAuthService(
                adminAccountRepository,
                operationEvents,
                passwordEncoder,
                jwtTokenProvider,
                passwordGenerator
        );
    }

    @Test
    void createAccountStoresAndReturnsOwnerEmail() {
        when(adminAccountRepository.existsByLoginId("new-admin")).thenReturn(false);
        when(passwordGenerator.generate()).thenReturn("Temp1234!");
        when(passwordEncoder.encode("Temp1234!")).thenReturn("encoded");
        when(adminAccountRepository.save(any(AdminAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(operationEvents.save(any(AdminOperationEvent.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AdminAccountCreateRequest request = new AdminAccountCreateRequest(
                "최고 관리자",
                "new-admin",
                "owner@example.com",
                AdminRole.owner
        );

        AdminAccountCreateData result = adminAuthService.createAccount("adm_actor", request);

        Assertions.assertThat(result.admin().email()).isEqualTo("owner@example.com");

        ArgumentCaptor<AdminAccount> accountCaptor = ArgumentCaptor.forClass(AdminAccount.class);
        org.mockito.Mockito.verify(adminAccountRepository).save(accountCaptor.capture());
        Assertions.assertThat(accountCaptor.getValue().getEmail()).isEqualTo("owner@example.com");
    }
}
