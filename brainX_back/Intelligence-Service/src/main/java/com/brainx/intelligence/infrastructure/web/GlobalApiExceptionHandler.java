package com.brainx.intelligence.infrastructure.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.settings.domain.SettingsDomainException;

/**
 * Public REST API 오류를 OpenAPI 공통 오류 wrapper로 변환합니다.
 */
@RestControllerAdvice
public class GlobalApiExceptionHandler {

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        BindException.class,
        HttpMessageNotReadableException.class,
        ExplorationDomainException.class,
        SettingsDomainException.class,
        IllegalArgumentException.class
    })
    public ResponseEntity<ApiErrorResponse> handleBadRequest(Exception exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ApiErrorResponse.of("BAD_REQUEST", safeMessage(exception)));
    }

    private static String safeMessage(Exception exception) {
        if (exception instanceof HttpMessageNotReadableException) {
            return "Malformed request body.";
        }
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Bad request." : message;
    }
}
