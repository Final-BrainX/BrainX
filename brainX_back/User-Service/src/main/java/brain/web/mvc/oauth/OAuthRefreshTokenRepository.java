package brain.web.mvc.oauth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OAuthRefreshTokenRepository extends JpaRepository<OAuthRefreshTokenEntity, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select token from OAuthRefreshTokenEntity token where token.tokenHash = :tokenHash")
    Optional<OAuthRefreshTokenEntity> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);
}
