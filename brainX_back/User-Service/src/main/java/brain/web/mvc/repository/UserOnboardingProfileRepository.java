package brain.web.mvc.repository;

import brain.web.mvc.entity.UserOnboardingProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserOnboardingProfileRepository extends JpaRepository<UserOnboardingProfile, String> {
}
