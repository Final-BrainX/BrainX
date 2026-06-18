package brain.web.mvc.service;

import brain.web.mvc.entity.EmailVerification;
import brain.web.mvc.entity.VerificationPurpose;
import brain.web.mvc.exception.ApiException;
import brain.web.mvc.repository.EmailVerificationRepository;
import brain.web.mvc.repository.UserRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {
    private final JavaMailSender javaMailSender;
    private final EmailVerificationRepository emailVerificationRepository;
    private final UserRepository userRepository;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${brainx.email.from:}")
    private String mailFrom;

    @Value("${brainx.email.verification-expiration-minutes}")
    private long verificationExpirationMinutes;

    @Transactional
    public EmailVerification requestVerification(String email, VerificationPurpose purpose) {
        if (purpose == VerificationPurpose.SIGNUP && userRepository.existsByEmail(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "이미 가입된 이메일입니다.");
        }
        if (purpose == VerificationPurpose.PASSWORD_CHANGE && !userRepository.existsByEmail(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "존재하지 않는 이메일입니다.");
        }

        EmailVerification verification = emailVerificationRepository.save(EmailVerification.builder()
                .email(email)
                .code(generateCode())
                .purpose(purpose)
                .expiresAt(LocalDateTime.now().plusMinutes(verificationExpirationMinutes))
                .verified(false)
                .build());

        sendVerificationMail(verification);
        return verification;
    }

    @Transactional
    public void verifySignupCode(String email, String code) {
        EmailVerification verification = getLatestVerification(email, VerificationPurpose.SIGNUP);
        if (!verification.matches(code)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "인증 코드가 올바르지 않습니다.");
        }
        verification.markVerified();
    }

    @Transactional
    public void verifyPasswordChangeCode(String email, String code) {
        EmailVerification verification = getLatestVerification(email, VerificationPurpose.PASSWORD_CHANGE);
        if (!verification.matches(code)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "인증 코드가 올바르지 않습니다.");
        }
        verification.markVerified();
    }

    @Transactional(readOnly = true)
    public boolean checkVerificationCode(String email, String code, VerificationPurpose purpose) {
        EmailVerification verification = getLatestVerification(email, purpose);
        return verification.matches(code);
    }

    @Scheduled(cron = "0 0 12 * * *")
    @Transactional
    public void deleteExpiredVerificationCodes() {
        emailVerificationRepository.deleteByExpiresAtBefore(LocalDateTime.now());
    }

    private EmailVerification getLatestVerification(String email, VerificationPurpose purpose) {
        EmailVerification verification = emailVerificationRepository
                .findTopByEmailAndPurposeOrderByCreatedAtDesc(email, purpose)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "인증 코드를 먼저 요청해 주세요."));

        if (verification.isExpired()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "인증 코드가 만료되었습니다.");
        }
        return verification;
    }

    private void sendVerificationMail(EmailVerification verification) {
        if (!StringUtils.hasText(mailUsername)) {
            log.info("Mail username is empty. Verification code for {} is {}", verification.getEmail(), verification.getCode());
            return;
        }

        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(verification.getEmail());
            if (StringUtils.hasText(mailFrom)) {
                helper.setFrom(mailFrom);
            }
            helper.setSubject("[BrainX] 이메일 인증 코드");
            helper.setText(mailContent(verification.getCode()), true);
            javaMailSender.send(message);
        } catch (MessagingException | RuntimeException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "인증 코드 이메일 발송에 실패했습니다.");
        }
    }

    public void sendTemporaryPasswordMail(String email, String temporaryPassword) {
        if (!StringUtils.hasText(mailUsername)) {
            log.info("Mail username is empty. Temporary password for {} is {}", email, temporaryPassword);
            return;
        }

        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(email);
            if (StringUtils.hasText(mailFrom)) {
                helper.setFrom(mailFrom);
            }
            helper.setSubject("[BrainX] 임시 비밀번호 안내");
            helper.setText(temporaryPasswordMailContent(temporaryPassword), true);
            javaMailSender.send(message);
        } catch (MessagingException | RuntimeException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "임시 비밀번호 이메일 발송에 실패했습니다.");
        }
    }

    private String mailContent(String code) {
        return """
                <html>
                  <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>BrainX 이메일 인증</h2>
                    <p>아래 인증 코드를 회원가입 화면에 입력해 주세요.</p>
                    <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; padding: 16px; background: #f3f4f6;">%s</div>
                    <p style="color: #6b7280;">본 메일은 자동 발송 메일입니다.</p>
                  </body>
                </html>
                """.formatted(code);
    }

    private String temporaryPasswordMailContent(String temporaryPassword) {
        return """
                <html>
                  <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>BrainX 임시 비밀번호</h2>
                    <p>아래 임시 비밀번호로 로그인한 뒤 마이페이지에서 새 비밀번호로 변경해 주세요.</p>
                    <div style="font-size: 22px; font-weight: 700; letter-spacing: 2px; padding: 16px; background: #f3f4f6;">%s</div>
                    <p style="color: #6b7280;">본인이 요청하지 않았다면 즉시 고객 지원에 문의해 주세요.</p>
                  </body>
                </html>
                """.formatted(temporaryPassword);
    }

    private String generateCode() {
        int code = ThreadLocalRandom.current().nextInt(100000, 1000000);
        return String.valueOf(code);
    }
}