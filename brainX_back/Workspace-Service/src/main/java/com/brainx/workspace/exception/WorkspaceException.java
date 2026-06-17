package com.brainx.workspace.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.Map;

@Getter
public class WorkspaceException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> details;

    public WorkspaceException(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public WorkspaceException(HttpStatus status, String code, String message, Map<String, Object> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
