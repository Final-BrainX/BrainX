package brain.web.mvc.repository;

import brain.web.mvc.entity.ConsentRecord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentRecordRepository extends JpaRepository<ConsentRecord, String> {
}
