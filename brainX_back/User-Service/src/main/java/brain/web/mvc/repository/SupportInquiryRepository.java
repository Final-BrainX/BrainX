package brain.web.mvc.repository;

import brain.web.mvc.entity.SupportInquiry;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupportInquiryRepository extends JpaRepository<SupportInquiry, String> {
    List<SupportInquiry> findByUserUserIdOrderByCreatedAtDesc(String userId);

    @EntityGraph(attributePaths = "user")
    List<SupportInquiry> findByStatusOrderByCreatedAtDesc(SupportInquiry.InquiryStatus status);

    @EntityGraph(attributePaths = "user")
    List<SupportInquiry> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = "user")
    Optional<SupportInquiry> findWithUserByInquiryId(String inquiryId);
}
