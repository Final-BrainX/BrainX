package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.*;
import com.brainx.admin.entity.AdminAccount;
import com.brainx.admin.entity.AdminOperationEvent;
import com.brainx.admin.entity.AdminRole;
import com.brainx.admin.exception.AdminAuthException;
import com.brainx.admin.repository.AdminAccountRepository;
import com.brainx.admin.repository.AdminOperationEventRepository;
import com.brainx.admin.security.AdminJwtTokenProvider;
import com.brainx.admin.security.StrongPasswordGenerator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Service
public class AdminAuthService {

    private static final Map<AdminRole, List<String>> ROLE_PERMISSIONS = Map.of(
            AdminRole.owner, List.of("최고관리자", "전체 접근 권한", "관리자 계정 관리"),
            AdminRole.admin, List.of("일반 관리자", "사용자/문의/결제 관리"),
            AdminRole.support, List.of("문의 담당자", "문의 답변 권한"),
            AdminRole.billing, List.of("결제 담당자", "결제/구독 관리 권한")
    );

    private final AdminAccountRepository adminAccountRepository;
    private final AdminOperationEventRepository operationEvents;
    private final PasswordEncoder passwordEncoder;
    private final AdminJwtTokenProvider jwtTokenProvider;
    private final StrongPasswordGenerator passwordGenerator;

    public AdminAuthService(
            AdminAccountRepository adminAccountRepository,
            AdminOperationEventRepository operationEvents,
            PasswordEncoder passwordEncoder,
            AdminJwtTokenProvider jwtTokenProvider,
            StrongPasswordGenerator passwordGenerator
    ) {
        this.adminAccountRepository = adminAccountRepository;
        this.operationEvents = operationEvents;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordGenerator = passwordGenerator;
    }

    @Transactional
    public AdminLoginData login(AdminLoginRequest request) {
        AdminAccount admin = adminAccountRepository.findByLoginId(request.loginId())
                .orElseThrow(() -> AdminAuthException.unauthorized("아이디 또는 비밀번호가 일치하지 않습니다."));

        if (!passwordEncoder.matches(request.password(), admin.getPasswordHash())) {
            throw AdminAuthException.unauthorized("아이디 또는 비밀번호가 일치하지 않습니다.");
        }

        admin.setLastLoginAt(OffsetDateTime.now());
        adminAccountRepository.save(admin);
        recordOperation(admin.getAdminId(), "ADMIN_LOGIN", "ADMIN_ACCOUNT", admin.getAdminId(), null);

        String accessToken = jwtTokenProvider.createAccessToken(admin);
        return new AdminLoginData(accessToken, toMeData(admin));
    }

    public AdminMeData getMe(String adminId) {
        return toMeData(findById(adminId));
    }

    @Transactional
    public AdminMeData updateProfile(String adminId, AdminProfileUpdateRequest request) {
        AdminAccount admin = findById(adminId);
        if (request.name() != null && !request.name().isBlank()) {
            admin.setName(request.name());
        }
        if (request.email() != null && !request.email().isBlank()) {
            admin.setEmail(request.email());
        }
        adminAccountRepository.save(admin);
        return toMeData(admin);
    }

    @Transactional
    public void changePassword(String adminId, AdminPasswordChangeRequest request) {
        AdminAccount admin = findById(adminId);
        if (!passwordEncoder.matches(request.currentPassword(), admin.getPasswordHash())) {
            throw AdminAuthException.badRequest("현재 비밀번호가 일치하지 않습니다.");
        }
        if (request.newPassword().length() < 8) {
            throw AdminAuthException.badRequest("새 비밀번호는 8자 이상이어야 합니다.");
        }
        admin.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        admin.setMustChangePassword(false);
        adminAccountRepository.save(admin);
        recordOperation(adminId, "ADMIN_PASSWORD_CHANGE", "ADMIN_ACCOUNT", adminId, null);
    }

    public AdminAccountsData listAccounts() {
        List<AdminAccountRow> rows = adminAccountRepository.findAllByOrderByCreatedAtAsc().stream()
                .map(this::toAccountRow)
                .toList();
        return new AdminAccountsData(rows);
    }

    @Transactional
    public AdminAccountCreateData createAccount(String requesterAdminId, AdminAccountCreateRequest request) {
        if (adminAccountRepository.existsByLoginId(request.loginId())) {
            throw AdminAuthException.conflict("이미 사용 중인 아이디입니다.");
        }

        String temporaryPassword = passwordGenerator.generate();
        AdminAccount admin = new AdminAccount(
                request.loginId(),
                request.name(),
                null,
                passwordEncoder.encode(temporaryPassword),
                request.role(),
                true
        );
        adminAccountRepository.save(admin);
        recordOperation(requesterAdminId, "ADMIN_ACCOUNT_CREATE", "ADMIN_ACCOUNT", admin.getAdminId(), "role=" + request.role());

        return new AdminAccountCreateData(toAccountRow(admin), temporaryPassword);
    }

    @Transactional
    public void deleteAccount(String requesterAdminId, String targetAdminId) {
        if (requesterAdminId.equals(targetAdminId)) {
            throw AdminAuthException.forbidden("본인 계정은 삭제할 수 없습니다.");
        }

        AdminAccount target = findById(targetAdminId);
        if (target.getRole() == AdminRole.owner && adminAccountRepository.countByRole(AdminRole.owner) <= 1) {
            throw AdminAuthException.conflict("마지막 최상위 관리자 계정은 삭제할 수 없습니다.");
        }

        adminAccountRepository.delete(target);
        recordOperation(requesterAdminId, "ADMIN_ACCOUNT_DELETE", "ADMIN_ACCOUNT", targetAdminId, null);
    }

    private AdminAccount findById(String adminId) {
        return adminAccountRepository.findById(adminId)
                .orElseThrow(() -> AdminAuthException.notFound("관리자 계정을 찾을 수 없습니다: " + adminId));
    }

    private AdminMeData toMeData(AdminAccount admin) {
        return new AdminMeData(
                admin.getAdminId(),
                admin.getName(),
                admin.getEmail(),
                admin.getRole().name(),
                ROLE_PERMISSIONS.getOrDefault(admin.getRole(), List.of()),
                admin.isMustChangePassword(),
                admin.getLastLoginAt(),
                admin.getCreatedAt()
        );
    }

    private AdminAccountRow toAccountRow(AdminAccount admin) {
        return new AdminAccountRow(
                admin.getAdminId(),
                admin.getName(),
                admin.getLoginId(),
                admin.getRole(),
                admin.isMustChangePassword(),
                admin.getCreatedAt(),
                admin.getLastLoginAt()
        );
    }

    private void recordOperation(String actorAdminId, String action, String targetType, String targetId, String detail) {
        operationEvents.save(new AdminOperationEvent(action, targetType, targetId, actorAdminId, detail));
    }
}
