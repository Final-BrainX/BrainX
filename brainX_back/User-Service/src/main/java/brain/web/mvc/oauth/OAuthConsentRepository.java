package brain.web.mvc.oauth;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthConsentRepository extends JpaRepository<OAuthConsentEntity, String> {
}
