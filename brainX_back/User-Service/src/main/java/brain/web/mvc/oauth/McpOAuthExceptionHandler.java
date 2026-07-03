package brain.web.mvc.oauth;

import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class McpOAuthExceptionHandler {

    @ExceptionHandler(McpOAuthException.class)
    public ResponseEntity<Map<String, String>> handle(McpOAuthException exception) {
        return ResponseEntity
            .status(exception.status())
            .body(Map.of(
                "error", exception.error(),
                "error_description", exception.getMessage()
            ));
    }
}
