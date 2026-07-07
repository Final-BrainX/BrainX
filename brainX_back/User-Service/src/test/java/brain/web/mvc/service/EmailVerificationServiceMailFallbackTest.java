package brain.web.mvc.service;

import brain.web.mvc.entity.EmailVerification;
import brain.web.mvc.entity.VerificationPurpose;
import brain.web.mvc.repository.EmailVerificationRepository;
import brain.web.mvc.repository.UserRepository;
import jakarta.mail.Address;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceMailFallbackTest {

    @Mock
    private JavaMailSender javaMailSender;

    @Mock
    private EmailVerificationRepository emailVerificationRepository;

    @Mock
    private UserRepository userRepository;

    private EmailVerificationService service;

    @BeforeEach
    void setUp() {
        service = new EmailVerificationService(javaMailSender, emailVerificationRepository, userRepository);
        ReflectionTestUtils.setField(service, "verificationExpirationMinutes", 30L);
    }

    @Test
    void requestVerificationFallsBackToMailUsernameWhenMailFromIsInvalid() throws Exception {
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
        when(userRepository.existsByEmail("brainx@example.com")).thenReturn(false);
        when(emailVerificationRepository.save(any(EmailVerification.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(javaMailSender.createMimeMessage()).thenReturn(message);
        ReflectionTestUtils.setField(service, "mailUsername", "sender@brainx.app");
        ReflectionTestUtils.setField(service, "mailPassword", "app-password");
        ReflectionTestUtils.setField(service, "mailFrom", "BrainX Sender");

        service.requestVerification("brainx@example.com", VerificationPurpose.SIGNUP);

        Address[] from = message.getFrom();
        assertThat(from).isNotNull();
        assertThat(from).hasSize(1);
        assertThat(((InternetAddress) from[0]).getAddress()).isEqualTo("sender@brainx.app");
        verify(javaMailSender).send(message);
    }

    @Test
    void requestVerificationSkipsMailSendWhenPasswordIsMissing() {
        when(userRepository.existsByEmail("brainx@example.com")).thenReturn(false);
        when(emailVerificationRepository.save(any(EmailVerification.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ReflectionTestUtils.setField(service, "mailUsername", "sender@brainx.app");
        ReflectionTestUtils.setField(service, "mailPassword", "");
        ReflectionTestUtils.setField(service, "mailFrom", "sender@brainx.app");

        EmailVerification verification = service.requestVerification("brainx@example.com", VerificationPurpose.SIGNUP);

        assertThat(verification.getEmail()).isEqualTo("brainx@example.com");
        verify(javaMailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void checkVerificationCodeUsesLatestVerification() {
        EmailVerification verification = EmailVerification.builder()
                .email("brainx@example.com")
                .code("123456")
                .purpose(VerificationPurpose.SIGNUP)
                .expiresAt(LocalDateTime.now().plusMinutes(5))
                .verified(false)
                .build();
        when(emailVerificationRepository.findTopByEmailAndPurposeOrderByCreatedAtDesc("brainx@example.com", VerificationPurpose.SIGNUP))
                .thenReturn(Optional.of(verification));

        boolean result = service.checkVerificationCode("brainx@example.com", "123456", VerificationPurpose.SIGNUP);

        assertThat(result).isTrue();
    }
}
