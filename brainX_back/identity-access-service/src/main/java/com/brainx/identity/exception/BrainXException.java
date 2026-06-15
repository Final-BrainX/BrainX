package com.brainx.identity.exception;

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

    // 자주 쓰는 예외 팩토리 메서드
    public static BrainXException notFound(String message) {
        return new BrainXException("NOT_FOUND", message, HttpStatus.NOT_FOUND);
    }

    public static BrainXException badRequest(String code, String message) {
        return new BrainXException(code, message, HttpStatus.BAD_REQUEST);
    }

    public static BrainXException unauthorized(String message) {
        return new BrainXException("UNAUTHORIZED", message, HttpStatus.UNAUTHORIZED);
    }

    public static BrainXException conflict(String message) {
        return new BrainXException("CONFLICT", message, HttpStatus.CONFLICT);
    }
}
