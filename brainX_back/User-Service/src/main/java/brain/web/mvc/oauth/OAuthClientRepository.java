package brain.web.mvc.oauth;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthClientRepository extends JpaRepository<OAuthClientEntity, String> {
}
