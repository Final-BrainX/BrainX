package brain.web.mvc.oauth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OAuthAuthorizationCodeRepository extends JpaRepository<OAuthAuthorizationCodeEntity, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select code from OAuthAuthorizationCodeEntity code where code.codeHash = :codeHash")
    Optional<OAuthAuthorizationCodeEntity> findByCodeHashForUpdate(@Param("codeHash") String codeHash);
}
