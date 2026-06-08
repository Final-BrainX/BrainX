package com.brainx.workspace.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class BrainXException extends RuntimeException {
    private final String errorCode;
    private final HttpStatus httpStatus;

    public BrainXException(String errorCode, String message, HttpStatus httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public static BrainXException notFound(String message) {
        return new BrainXException("NOT_FOUND", message, HttpStatus.NOT_FOUND);
    }

    public static BrainXException badRequest(String code, String message) {
        return new BrainXException(code, message, HttpStatus.BAD_REQUEST);
    }

    public static BrainXException forbidden(String message) {
        return new BrainXException("FORBIDDEN", message, HttpStatus.FORBIDDEN);
    }

    public static BrainXException conflict(String message) {
        return new BrainXException("VERSION_CONFLICT", message, HttpStatus.CONFLICT);
    }
}
