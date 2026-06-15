package brain.web.mvc.repository;

import brain.web.mvc.entity.OAuthAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface OAuthAccountRepository extends JpaRepository<OAuthAccount, String> {
    Optional<OAuthAccount> findByProviderAndProviderUserId(String provider, String providerUserId);

    List<OAuthAccount> findByUserUserId(String userId);

    Optional<OAuthAccount> findByUserUserIdAndProvider(String userId, String provider);
}
