package brain.web.mvc.service;

import brain.web.mvc.entity.EmailVerification;
import brain.web.mvc.entity.VerificationPurpose;
import brain.web.mvc.exception.ApiException;
import brain.web.mvc.repository.EmailVerificationRepository;
import brain.web.mvc.repository.UserRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
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

    @Value("${spring.mail.password:}")
    private String mailPassword;

    @Value("${brainx.email.from:}")
    private String mailFrom;

    @Value("${brainx.email.verification-expiration-minutes}")
    private long verificationExpirationMinutes;

    @Transactional
    public EmailVerification requestVerification(String email, VerificationPurpose purpose) {
        if (purpose == VerificationPurpose.SIGNUP && userRepository.existsByEmail(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "이미 가입한 이메일입니다.");
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
        if (!isMailDeliveryConfigured()) {
            log.warn("SMTP is not fully configured. Verification code for {} is {}", verification.getEmail(), verification.getCode());
            return;
        }

        String senderAddress = resolveSenderAddress();
        try {
            sendHtmlMail(
                    verification.getEmail(),
                    senderAddress,
                    "[BrainX] 이메일 인증 코드",
                    mailContent(verification.getCode())
            );
        } catch (MessagingException | MailException | RuntimeException exception) {
            log.warn("HTML verification mail send failed for {}: {}", verification.getEmail(), exception.getMessage(), exception);
            try {
                sendPlainTextMail(
                        verification.getEmail(),
                        senderAddress,
                        "[BrainX] 이메일 인증 코드",
                        plainVerificationMailContent(verification.getCode())
                );
                log.info("Plain-text verification mail fallback succeeded for {}", verification.getEmail());
            } catch (MailException | RuntimeException fallbackException) {
                log.error("Verification mail send failed for {} after HTML and plain-text attempts: {}", verification.getEmail(), fallbackException.getMessage(), fallbackException);
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "인증 코드 이메일 발송에 실패했습니다.");
            }
        }
    }

    public void sendTemporaryPasswordMail(String email, String temporaryPassword) {
        if (!isMailDeliveryConfigured()) {
            log.warn("SMTP is not fully configured. Temporary password for {} is {}", email, temporaryPassword);
            return;
        }

        String senderAddress = resolveSenderAddress();
        try {
            sendHtmlMail(
                    email,
                    senderAddress,
                    "[BrainX] 임시 비밀번호 안내",
                    temporaryPasswordMailContent(temporaryPassword)
            );
        } catch (MessagingException | MailException | RuntimeException exception) {
            log.warn("HTML temporary password mail send failed for {}: {}", email, exception.getMessage(), exception);
            try {
                sendPlainTextMail(
                        email,
                        senderAddress,
                        "[BrainX] 임시 비밀번호 안내",
                        plainTemporaryPasswordMailContent(temporaryPassword)
                );
                log.info("Plain-text temporary password mail fallback succeeded for {}", email);
            } catch (MailException | RuntimeException fallbackException) {
                log.error("Temporary password mail send failed for {} after HTML and plain-text attempts: {}", email, fallbackException.getMessage(), fallbackException);
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "임시 비밀번호 이메일 발송에 실패했습니다.");
            }
        }
    }

    private void sendHtmlMail(String recipient, String senderAddress, String subject, String htmlBody) throws MessagingException {
        MimeMessage message = javaMailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
        helper.setTo(recipient);
        if (senderAddress != null) {
            helper.setFrom(senderAddress);
        }
        helper.setSubject(subject);
        helper.setText(htmlBody, true);
        javaMailSender.send(message);
    }

    private void sendPlainTextMail(String recipient, String senderAddress, String subject, String textBody) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipient);
        if (senderAddress != null) {
            message.setFrom(senderAddress);
        }
        message.setSubject(subject);
        message.setText(textBody);
        javaMailSender.send(message);
    }

    private boolean isMailDeliveryConfigured() {
        return StringUtils.hasText(mailUsername) && StringUtils.hasText(mailPassword);
    }

    private String resolveSenderAddress() {
        String preferred = normalizeAddress(mailFrom);
        if (preferred != null) {
            return preferred;
        }
        return normalizeAddress(mailUsername);
    }

    private String normalizeAddress(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            InternetAddress address = new InternetAddress(raw.trim(), true);
            return address.getAddress();
        } catch (AddressException exception) {
            log.warn("Ignoring invalid sender address configuration: {}", raw);
            return null;
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

    private String plainVerificationMailContent(String code) {
        return """
                BrainX 이메일 인증

                아래 인증 코드를 회원가입 화면에 입력해 주세요.

                인증 코드: %s
                """.formatted(code);
    }

    private String plainTemporaryPasswordMailContent(String temporaryPassword) {
        return """
                BrainX 임시 비밀번호 안내

                아래 임시 비밀번호로 로그인한 뒤 마이페이지에서 새 비밀번호로 변경해 주세요.

                임시 비밀번호: %s
                """.formatted(temporaryPassword);
    }

    private String generateCode() {
        int code = ThreadLocalRandom.current().nextInt(100000, 1000000);
        return String.valueOf(code);
    }
}
