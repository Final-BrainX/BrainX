package brain.web.mvc.repository;

import brain.web.mvc.entity.User;
import brain.web.mvc.entity.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    boolean existsByEmail(String email);

    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u WHERE " +
           "(:q IS NULL OR :q = '' OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%')) OR LOWER(u.nickname) LIKE LOWER(CONCAT('%', :q, '%'))) AND " +
           "(:status IS NULL OR u.status = :status) AND " +
           "(:joinedYear IS NULL OR YEAR(u.createdAt) = :joinedYear)")
    List<User> findUsersInternal(@Param("q") String q, @Param("status") UserStatus status, @Param("joinedYear") Integer joinedYear);
}
