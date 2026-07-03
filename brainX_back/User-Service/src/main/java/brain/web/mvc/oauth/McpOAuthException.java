package brain.web.mvc.oauth;

import org.springframework.http.HttpStatus;

public class McpOAuthException extends RuntimeException {
    private final HttpStatus status;
    private final String error;

    public McpOAuthException(HttpStatus status, String error, String description) {
        super(description);
        this.status = status;
        this.error = error;
    }

    public HttpStatus status() {
        return status;
    }

    public String error() {
        return error;
    }
}
