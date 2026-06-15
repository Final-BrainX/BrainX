package com.brainx.identity.service;

import com.brainx.identity.dto.request.AuthRequest.*;
import com.brainx.identity.dto.response.AuthResponse.*;
import com.brainx.identity.entity.*;
import com.brainx.identity.exception.BrainXException;
import com.brainx.identity.repository.*;
import com.brainx.identity.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final EmailVerificationRepository emailVerificationRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ConsentRecordRepository consentRecordRepository;
    private final OAuthAccountRepository oAuthAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final EmailService emailService;

    @Transactional
    public EmailVerificationResponse requestEmailVerification(EmailVerificationRequest request) {
        EmailVerification.Purpose purpose = "signup".equals(request.getPurpose())
                ? EmailVerification.Purpose.SIGNUP
                : EmailVerification.Purpose.PASSWORD_CHANGE;

        if (purpose == EmailVerification.Purpose.SIGNUP && userRepository.existsByEmail(request.getEmail())) {
            throw BrainXException.conflict("이미 사용 중인 이메일입니다");
        }

        String code = String.format("%06d", new Random().nextInt(999999));
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(10);

        EmailVerification verification = EmailVerification.builder()
                .email(request.getEmail())
                .code(code)
                .purpose(purpose)
                .expiresAt(expiresAt)
                .build();

        emailVerificationRepository.save(verification);
        emailService.sendVerificationCode(request.getEmail(), code);

        return EmailVerificationResponse.builder()
                .verificationId(verification.getVerificationId())
                .expiresAt(expiresAt)
                .build();
    }

    @Transactional
    public TokenResponse signup(EmailSignupRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw BrainXException.conflict("이미 사용 중인 이메일입니다");
        }

        EmailVerification verification = emailVerificationRepository
                .findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(
                        request.getEmail(), EmailVerification.Purpose.SIGNUP)
                .orElseThrow(() -> BrainXException.badRequest("VERIFICATION_NOT_FOUND", "이메일 인증 정보를 찾을 수 없습니다"));

        if (verification.isExpired()) {
            throw BrainXException.badRequest("VERIFICATION_EXPIRED", "인증 코드가 만료되었습니다");
        }
        if (!verification.getCode().equals(request.getCode())) {
            throw BrainXException.badRequest("INVALID_VERIFICATION_CODE", "인증 코드가 올바르지 않습니다");
        }

        verification.setVerified(true);
        emailVerificationRepository.save(verification);

        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .emailVerified(true)
                .build();
        userRepository.save(user);

        if (request.getConsents() != null) {
            saveConsentRecord(user, request.getConsents());
        }

        String accessToken = jwtTokenProvider.generateAccessToken(user.getUserId(), user.getEmail());
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getUserId());
        saveRefreshToken(user, refreshToken);

        log.info("새 사용자 가입: userId={}, email={}", user.getUserId(), user.getEmail());

        return TokenResponse.builder()
                .userId(user.getUserId())
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .requires2fa(false)
                .next("onboarding")
                .build();
    }

    @Transactional
    public TokenResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> BrainXException.unauthorized("이메일 또는 비밀번호가 올바르지 않습니다"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw BrainXException.unauthorized("이메일 또는 비밀번호가 올바르지 않습니다");
        }

        if (user.getStatus() != User.UserStatus.ACTIVE) {
            throw BrainXException.unauthorized("비활성화된 계정입니다");
        }

        String accessToken = jwtTokenProvider.generateAccessToken(user.getUserId(), user.getEmail());
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getUserId());
        saveRefreshToken(user, refreshToken);

        return TokenResponse.builder()
                .userId(user.getUserId())
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .requires2fa(user.isTwoFactorEnabled())
                .build();
    }

    @Transactional
    public OkResponse logout(String userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
        return OkResponse.builder().ok(true).build();
    }

    @Transactional
    public void changePassword(String userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw BrainXException.badRequest("INVALID_CURRENT_PASSWORD", "현재 비밀번호가 올바르지 않습니다");
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        refreshTokenRepository.revokeAllByUserId(userId);
    }

    @Transactional
    public DeletionResponse requestAccountDeletion(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));

        LocalDateTime deletionScheduledAt = LocalDateTime.now().plusDays(30);
        user.setStatus(User.UserStatus.PENDING_DELETION);
        user.setDeletionScheduledAt(deletionScheduledAt);
        userRepository.save(user);

        return DeletionResponse.builder()
                .deletionScheduledAt(deletionScheduledAt)
                .build();
    }

    @Transactional
    public OkResponse cancelAccountDeletion(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));

        user.setStatus(User.UserStatus.ACTIVE);
        user.setDeletionScheduledAt(null);
        userRepository.save(user);

        return OkResponse.builder().ok(true).build();
    }

    @Transactional
    public UserProfileResponse getMyProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));
        ConsentRecord consent = consentRecordRepository.findTopByUserUserIdOrderByCreatedAtDesc(userId).orElse(null);
        List<OAuthAccount> oauthAccounts = oAuthAccountRepository.findAll().stream()
                .filter(o -> o.getUser().getUserId().equals(userId))
                .toList();
        return UserProfileResponse.from(user, consent, oauthAccounts);
    }

    @Transactional
    public UserProfileResponse updateProfile(String userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));

        if (request.getNickname() != null) {
            user.setNickname(request.getNickname());
        }
        userRepository.save(user);

        ConsentRecord consent = consentRecordRepository.findTopByUserUserIdOrderByCreatedAtDesc(userId).orElse(null);
        return UserProfileResponse.from(user, consent, List.of());
    }

    @Transactional
    public void updateConsents(String userId, ConsentRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> BrainXException.notFound("사용자를 찾을 수 없습니다"));
        saveConsentRecord(user, request);
    }

    private void saveConsentRecord(User user, ConsentRequest request) {
        ConsentRecord consent = ConsentRecord.builder()
                .user(user)
                .termsRequired(request.isTermsRequired())
                .privacyRequired(request.isPrivacyRequired())
                .marketingOptional(request.isMarketingOptional())
                .behaviorAnalyticsOptional(request.isBehaviorAnalyticsOptional())
                .build();
        consentRecordRepository.save(consent);
    }

    private void saveRefreshToken(User user, String token) {
        // 기존 토큰 모두 폐기 후 새로 저장 (중복 방지)
        refreshTokenRepository.revokeAllByUserId(user.getUserId());

        String tokenHash = hashToken(token);
        // 혹시 같은 해시가 이미 있으면 삭제
        refreshTokenRepository.findByTokenHash(tokenHash)
                .ifPresent(refreshTokenRepository::delete);
        refreshTokenRepository.flush();

        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        refreshTokenRepository.save(refreshToken);
    }

    private String hashToken(String token) {
        try {
            // 토큰 자체가 이미 고유한 JWT이므로 그대로 해시
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            // 타임스탬프를 섞어 동일 토큰 재저장 시 충돌 방지
            String input = token + System.nanoTime();
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 해시 오류", e);
        }
    }
}
