package com.brainx.admin.exception;

import org.springframework.http.HttpStatus;

public class AdminAuthException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public AdminAuthException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AdminAuthException unauthorized(String message) {
        return new AdminAuthException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", message);
    }

    public static AdminAuthException forbidden(String message) {
        return new AdminAuthException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }

    public static AdminAuthException conflict(String message) {
        return new AdminAuthException(HttpStatus.CONFLICT, "CONFLICT", message);
    }

    public static AdminAuthException notFound(String message) {
        return new AdminAuthException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public static AdminAuthException badRequest(String message) {
        return new AdminAuthException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
