package brain.web.mvc.repository;

import brain.web.mvc.entity.EmailVerification;
import brain.web.mvc.entity.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, String> {
    Optional<EmailVerification> findTopByEmailAndPurposeOrderByCreatedAtDesc(String email, VerificationPurpose purpose);

    void deleteByExpiresAtBefore(LocalDateTime now);
}
