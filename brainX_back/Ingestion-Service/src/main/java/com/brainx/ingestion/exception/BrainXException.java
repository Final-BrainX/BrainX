package com.brainx.ingestion.exception;

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

    public static BrainXException internalError(String message) {
        return new BrainXException("INTERNAL_ERROR", message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
