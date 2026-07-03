package brain.web.mvc;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:user_service_context;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "brainx.jwt.secret=test-jwt-secret-for-user-service-oauth",
        "brainx.mcp-oauth.issuer=http://localhost:3000",
        "brainx.mcp-oauth.resource=http://localhost:3000/mcp"
})
class UserServiceApplicationTests {

    @Test
    void contextLoads() {
    }

}
